"""End-to-end smoke test for the PvP module: two real WebSocket clients vs a real backend.

Run (module form, local Supabase must be up):

    uv run python -m scripts.pvp_smoke

The script boots its own backend on :8123 with FAKE_ENGINE and a 2-second bullet clock (so
the timeout path is fast), mints throwaway users via the service-role admin API, and drives
every path end-to-end: pairing isolation, lockstep turns, the content gate on opponent
frames, all four end states (scored/draw, date_landed, blocked, timeout) pushed to the idle
opponent with both sockets closing, reconnect → gated match_state, the 4000 second-socket
rule, the friend-invite flow (join / bad code / cancel / creator-disconnect), unrated
matches writing no rating rows, and RLS spot-checks with real user tokens.
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import time
import urllib.request
import uuid
from typing import Any

from postgrest.exceptions import APIError
from supabase import AsyncClient
from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed

from app.config import get_settings

PORT = 8123
WS_URL = f"ws://127.0.0.1:{PORT}/ws/match"

# A message that avoids every FakeEngine keyword and lands the +18 "long message" branch,
# so identical play on both sides grades identically (→ the scored end is a draw).
GOOD_MOVE = "so tell me about the weirdest hobby you have picked up this year, honestly"

_failures: list[str] = []


def check(cond: bool, label: str) -> None:
    print(f"  {'✓' if cond else '✗ FAIL:'} {label}")
    if not cond:
        _failures.append(label)


# -- backend under test ------------------------------------------------------


def start_backend() -> subprocess.Popen[bytes]:
    env = os.environ | {
        "FAKE_ENGINE": "true",
        "PVP_BULLET_BASE_SECONDS": "2",  # fast flag for the timeout test
        "PVP_BULLET_INCREMENT_SECONDS": "1",
        "PVP_RAPID_BASE_SECONDS": "30",  # roomy for the play-through tests
        "PVP_INTRO_GRACE_SECONDS": "0",
    }
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--port", str(PORT), "--log-level", "warning"],
        env=env,
    )
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=1):
                return proc
        except Exception:
            time.sleep(0.3)
    proc.terminate()
    raise RuntimeError("backend did not come up on :8123")


# -- players -------------------------------------------------------------------


async def make_player(db: AsyncClient, tag: str, gender: str, seeking: str) -> tuple[str, str]:
    """Create a confirmed throwaway user, set gender/seeking, return (user_id, access_token)."""
    settings = get_settings()
    email = f"pvp-smoke-{tag}-{uuid.uuid4().hex[:8]}@example.com"
    password = "pvp-smoke-secret-1"
    created = await db.auth.admin.create_user(
        {"email": email, "password": password, "email_confirm": True}
    )
    assert created.user is not None
    user_id = created.user.id
    # Fresh client per sign-in so sessions don't clobber each other.
    login = AsyncClient(settings.supabase_url, settings.supabase_service_role_key)
    session = await login.auth.sign_in_with_password({"email": email, "password": password})
    assert session.session is not None
    await db.table("profiles").update({"gender": gender, "seeking": seeking}).eq(
        "id", user_id
    ).execute()
    return user_id, session.session.access_token


def rls_client(token: str) -> AsyncClient:
    """A PostgREST client acting as the given user (authenticated role, RLS applies)."""
    settings = get_settings()
    client = AsyncClient(settings.supabase_url, settings.supabase_service_role_key)
    client.postgrest.auth(token)
    return client


# -- one player's socket ---------------------------------------------------------


class Player:
    def __init__(self, name: str, token: str) -> None:
        self.name = name
        self.token = token
        self.ws: ClientConnection | None = None

    async def open(self) -> None:
        self.ws = await connect(f"{WS_URL}?token={self.token}")

    async def send(self, payload: dict[str, Any]) -> None:
        assert self.ws is not None
        await self.ws.send(json.dumps(payload))

    async def recv(self, timeout: float = 10.0) -> dict[str, Any]:
        assert self.ws is not None
        raw = await asyncio.wait_for(self.ws.recv(), timeout)
        msg = json.loads(raw)
        assert isinstance(msg, dict)
        return msg

    async def expect(self, msg_type: str, timeout: float = 10.0) -> dict[str, Any]:
        msg = await self.recv(timeout)
        check(msg["type"] == msg_type, f"{self.name} ← {msg_type} (got {msg['type']})")
        return msg

    async def expect_closed(self, timeout: float = 10.0, code: int | None = None) -> None:
        assert self.ws is not None
        try:
            raw = await asyncio.wait_for(self.ws.recv(), timeout)
            check(False, f"{self.name} socket closed (got a frame instead: {raw[:80]!r})")
        except ConnectionClosed as exc:
            got = exc.rcvd.code if exc.rcvd else None
            ok = code is None or got == code
            check(ok, f"{self.name} socket closed{f' with {code}' if code else ''} (got {got})")
        except TimeoutError:
            check(False, f"{self.name} socket closed (still open after {timeout}s)")

    async def close(self) -> None:
        if self.ws is not None:
            await self.ws.close()
            self.ws = None


async def _move_sides(client: AsyncClient, match_id: str) -> list[str]:
    """Which sides' match_moves rows the client can read (RLS-scoped)."""
    res = await client.table("match_moves").select("side").eq("match_id", match_id).execute()
    rows: list[dict[str, Any]] = list(res.data or [])  # type: ignore[arg-type]
    return [str(r["side"]) for r in rows]


async def start_match(
    a: Player, b: Player, tc: str = "rapid"
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Open sockets for both, queue them, and return each side's match_found payload."""
    await a.open()
    await a.send({"type": "queue", "time_control": tc})
    await a.expect("queued")
    await b.open()
    await b.send({"type": "queue", "time_control": tc})
    found_b = await b.expect("match_found")
    await b.expect("turn")
    found_a = await a.expect("match_found")
    await a.expect("turn")
    return found_a, found_b


# -- the scenario ---------------------------------------------------------------


async def main() -> int:
    settings = get_settings()
    db = AsyncClient(settings.supabase_url, settings.supabase_service_role_key)

    print("· creating players")
    a_id, a_token = await make_player(db, "a", "man", "woman")
    b_id, b_token = await make_player(db, "b", "man", "woman")
    c_id, c_token = await make_player(db, "c", "woman", "man")
    a, b, c = Player("A", a_token), Player("B", b_token), Player("C", c_token)

    print("· pairing isolation (tc/gender/seeking pools)")
    await a.open()
    await a.send({"type": "queue", "time_control": "rapid"})
    await a.expect("queued")
    await c.open()
    await c.send({"type": "queue", "time_control": "rapid"})
    await c.expect("queued")  # woman-seeking-man never pairs with man-seeking-woman
    await c.send({"type": "cancel"})
    await c.expect("cancelled")
    await c.close()

    print("· matchmaking pair + lockstep + content gate")
    await b.open()
    await b.send({"type": "queue", "time_control": "rapid"})
    found_b = await b.expect("match_found")
    turn_b = await b.expect("turn")
    found_a = await a.expect("match_found")
    turn_a = await a.expect("turn")
    match_id = found_a["match_id"]
    check(found_a["your_side"] == "a", "waiter (A) is side a")
    check(found_b["your_side"] == "b", "joiner (B) is side b")
    check(found_a["rated"] is True, "matchmade match is rated")
    check(
        found_a["persona"]["opening_line"] == found_b["persona"]["opening_line"],
        "both sides get the same persona + opening line",
    )
    check(found_a["opponent"]["ranked_elo"] is not None, "opponent elo shown on rated match")
    check(turn_a["turn"] == "you" and turn_b["turn"] == "opponent", "side a is on the move")

    await b.send({"type": "move", "content": GOOD_MOVE})
    err = await b.expect("error")
    check(err["code"] == "not_your_turn", "moving out of turn → not_your_turn")

    await a.send({"type": "move", "content": GOOD_MOVE})
    resp = await a.expect("response")
    check(bool(resp["classification"]), "mover gets a graded response")
    await a.expect("turn")
    opp = await b.expect("opp_move")
    check(opp["move"]["content"] is None, "opponent move content is gated (null)")
    check(opp["move"]["classification"] is not None, "…but the glyph/classification flows")
    check(opp["reply"]["content"] is None, "the persona's reply in their thread is gated too")
    await b.expect("turn")

    print("· RLS mid-match: opponent thread invisible, engine output invisible")
    as_b = rls_client(b_token)
    sides = await _move_sides(as_b, match_id)
    check(bool(sides) and all(s == "b" for s in sides), "B reads only their own side mid-match")
    # engine_responses has no client grant at all — the read is denied outright (42501),
    # which is even stronger than an RLS-empty result.
    try:
        res = await as_b.table("engine_responses").select("id").eq("match_id", match_id).execute()
        check(not res.data, "engine_responses invisible to clients")
    except APIError as exc:
        check(exc.code == "42501", "engine_responses read denied outright (42501)")

    print("· second socket replaces the first (4000) and resumes with a gated match_state")
    a2 = Player("A2", a_token)
    await a2.open()
    state = await a2.expect("match_state")
    await a.expect_closed(code=4000)
    check(state["turn"] == "opponent", "resume: B is on the move")
    check(
        all(m["content"] is None for m in state["opp_moves"]),
        "resume: opp_moves content stays gated",
    )
    check(all(m["content"] for m in state["your_moves"]), "resume: own thread has content")
    check(state["your_time_left"] > 0 and state["opp_time_left"] > 0, "resume: both clocks sane")

    print("· identical play to the exchange cap → scored draw")
    max_exchanges = int(found_a["max_exchanges"])
    finish_a: dict[str, Any] | None = None
    finish_b: dict[str, Any] | None = None
    for exchange in range(1, max_exchanges + 1):
        # B answers exchange N (A already played exchange 1 above).
        await b.send({"type": "move", "content": GOOD_MOVE})
        await b.expect("response")
        msg = await b.recv()  # turn — or match_finish on the final exchange
        if msg["type"] == "match_finish":
            finish_b = msg
            await a2.expect("opp_move")
            finish_a = await a2.expect("match_finish")
            break
        await a2.expect("opp_move")
        await a2.expect("turn")
        # A answers exchange N+1.
        await a2.send({"type": "move", "content": GOOD_MOVE})
        await a2.expect("response")
        await a2.expect("turn")
        await b.expect("opp_move")
        await b.expect("turn")
    assert finish_a is not None and finish_b is not None
    check(finish_a["end_reason"] == "scored", "cap reached → end_reason scored")
    check(
        finish_a["result"] == "draw" and finish_b["result"] == "draw",
        "identical play → draw on both sides",
    )
    check(finish_a["rating_delta"] == 0, "draw between equals → ±0 elo")
    check(
        bool(finish_a["opp_moves"]) and all(m["content"] for m in finish_a["opp_moves"]),
        "finish carries the full opponent transcript (the reveal)",
    )
    await a2.expect_closed()
    await b.expect_closed()

    sides = await _move_sides(as_b, match_id)
    check("a" in sides, "post-match: opponent thread visible via RLS")

    print("· date landed = instant win, pushed to the idle opponent")
    await start_match(a, b)
    await a.send({"type": "move", "content": "ok — coffee saturday?"})
    await a.expect("response")
    win = await a.expect("match_finish")
    check(win["result"] == "win" and win["end_reason"] == "date_landed", "mover wins by mate")
    await b.expect("opp_move")
    lose = await b.expect("match_finish")
    check(lose["result"] == "loss", "idle opponent is told they lost")
    check(win["rating_delta"] > 0 > lose["rating_delta"], "elo moved in both directions")
    await a.expect_closed()
    await b.expect_closed()
    history = (
        await db.table("rating_history").select("kind").in_("user_id", [a_id, b_id]).eq("kind", "ranked").execute()
    ).data
    check(len(history) >= 2, "rating_history rows written for a rated finish")

    print("· blocked = instant loss for the mover")
    await start_match(a, b)
    await a.send({"type": "move", "content": "haha you creep me out"})
    await a.expect("response")
    blocked = await a.expect("match_finish")
    check(
        blocked["result"] == "loss" and blocked["end_reason"] == "blocked",
        "mover loses by block",
    )
    await b.expect("opp_move")
    check((await b.expect("match_finish"))["result"] == "win", "opponent wins by block")
    await a.expect_closed()
    await b.expect_closed()

    print("· timeout: the idle on-move player flags, both sockets get the finish")
    await start_match(a, b, tc="bullet")  # 2s base, no grace
    flagged = await a.expect("match_finish", timeout=8)
    check(flagged["end_reason"] == "timeout" and flagged["result"] == "loss", "side a flags")
    check((await b.expect("match_finish", timeout=8))["result"] == "win", "side b wins on time")
    await a.expect_closed()
    await b.expect_closed()

    print("· friend invite: unguessable code, unrated match, no rating rows")
    ranked_rows_before = len(
        (await db.table("rating_history").select("id").eq("kind", "ranked").execute()).data
    )
    await a.open()
    await a.send({"type": "create_invite", "time_control": "rapid"})
    invite = await a.expect("invite_created")
    code = invite["code"]
    await c.open()
    await c.send({"type": "join_invite", "code": "not-a-real-code"})
    check((await c.expect("error"))["code"] == "bad_code", "wrong code is rejected")
    await c.send({"type": "join_invite", "code": code})
    found_c = await c.expect("match_found")
    await c.expect("turn")
    found_a = await a.expect("match_found")
    await a.expect("turn")
    check(found_a["rated"] is False and found_c["rated"] is False, "friend match is unrated")
    check(found_c["opponent"]["ranked_elo"] is None, "no elo shown on an unrated match")
    check(found_a["your_side"] == "a", "creator is side a")
    await a.send({"type": "move", "content": "drinks tomorrow?"})
    await a.expect("response")
    check((await a.expect("match_finish"))["rating_delta"] == 0, "unrated finish → ±0")
    await c.expect("opp_move")
    await c.expect("match_finish")
    await a.expect_closed()
    await c.expect_closed()
    ranked_rows_after = len(
        (await db.table("rating_history").select("id").eq("kind", "ranked").execute()).data
    )
    check(ranked_rows_after == ranked_rows_before, "friend match wrote no rating history")
    as_c = rls_client(c_token)
    invites_visible = (await as_c.table("match_invites").select("id").execute()).data
    check(not invites_visible, "match_invites invisible to non-creators (RLS)")

    print("· invite lifecycle: cancel and creator-disconnect kill the code")
    await a.open()
    await a.send({"type": "create_invite", "time_control": "rapid"})
    code = (await a.expect("invite_created"))["code"]
    await a.send({"type": "cancel"})
    await a.expect("cancelled")
    await c.open()
    await c.send({"type": "join_invite", "code": code})
    check((await c.expect("error"))["code"] == "bad_code", "cancelled code is dead")
    await a.close()
    await a.open()
    await a.send({"type": "create_invite", "time_control": "rapid"})
    code = (await a.expect("invite_created"))["code"]
    await a.close()  # creator walks away → invite dies with the socket
    await asyncio.sleep(0.3)
    await c.send({"type": "join_invite", "code": code})
    check((await c.expect("error"))["code"] == "bad_code", "creator-less code is dead")
    await c.close()

    print()
    if _failures:
        print(f"✗ {len(_failures)} check(s) failed:")
        for f in _failures:
            print(f"  - {f}")
        return 1
    print("✓ all checks passed")
    return 0


if __name__ == "__main__":
    backend = start_backend()
    try:
        raise SystemExit(asyncio.run(main()))
    finally:
        backend.terminate()
        backend.wait(timeout=10)

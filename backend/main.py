"""MateDate backend entrypoint.

Solo PvE (player vs AI date) runs over a single authenticated WebSocket per user at `/ws`;
ranked PvP (player vs player, same persona) over `/ws/match`. All live-play state is written
server-side via a service-role Supabase client.
"""

import logging

from fastapi import FastAPI, WebSocket

from app.match_ws import match_ws
from app.ws import solo_ws

# Uvicorn only configures its own loggers (root stays at WARNING), so app-level INFO logs would
# never reach stdout / Railway. Add a root StreamHandler at INFO once, at import time. This is a
# no-op if something already configured the root logger, and leaves uvicorn's own loggers alone.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

logger = logging.getLogger("matedate.main")

app = FastAPI(title="MateDate Backend")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.on_event("startup")
async def _log_startup() -> None:
    logger.info("MateDate backend started; routes: /health, /ws (solo), /ws/match (pvp)")


@app.websocket("/ws")
async def ws(websocket: WebSocket) -> None:
    await solo_ws(websocket)


@app.websocket("/ws/match")
async def ws_match(websocket: WebSocket) -> None:
    await match_ws(websocket)

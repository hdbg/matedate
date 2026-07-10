"""MateDate backend entrypoint.

Solo PvE (player vs AI date) runs over a single authenticated WebSocket per user at `/ws`.
All live-play state is written server-side via a service-role Supabase client.
"""

from fastapi import FastAPI, WebSocket

from app.ws import solo_ws

app = FastAPI(title="MateDate Backend")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws")
async def ws(websocket: WebSocket) -> None:
    await solo_ws(websocket)

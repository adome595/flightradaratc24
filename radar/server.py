"""
server.py - ATC 24 radar website backend (Python 3.9+)

Setup:
    pip install aiohttp
    python server.py
Then open http://localhost:8080

Folder layout:
    server.py
    static/
        index.html
        css/   base, topbar, sidebar, map, detail, calibrate
        js/    main, config, state, utils, map, background, aircraft,
            panels, stream, calibrate
        img/   ptfsmap.png

The server is the only thing that talks to 24data (one WebSocket + fallback
polling). Browsers connect to this server over SSE, so you never hit 24data's
rate limits no matter how many people open the page.

Optional env vars: HOST (default 127.0.0.1, use 0.0.0.0 to expose), PORT (default 8080).
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import aiohttp
from aiohttp import web

BASE = "https://24data.ptfs.app"
WSS_URL = "wss://24data.ptfs.app/wss"
STATIC = Path(__file__).parent / "static"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("radar")


# ======================================================================
# 24data client (shared cache + WebSocket + fallback polling)
# ======================================================================
class DataClient:
    def __init__(self, session: aiohttp.ClientSession):
        self.session = session
        self.ws_open = False
        self.aircraft = {}
        self.event_aircraft = {}
        self.controllers = []
        self.atis = {}
        self.flight_plans = []
        self.last_update = None
        self.tasks = []

    # ---------- REST ----------
    async def get_json(self, path: str):
        async with self.session.get(f"{BASE}{path}") as res:
            if res.status != 200:
                raise RuntimeError(f"{path} -> HTTP {res.status}")
            return await res.json()

    async def refresh_aircraft(self):
        self.aircraft = await self.get_json("/acft-data")
        self.last_update = datetime.now(timezone.utc).isoformat()

    async def refresh_event_aircraft(self):
        self.event_aircraft = await self.get_json("/acft-data/event")

    async def refresh_controllers(self):
        self.controllers = await self.get_json("/controllers")

    async def refresh_atis(self):
        try:
            for a in await self.get_json("/atis"):
                self.atis[a["airport"]] = a
        except Exception as err:
            # 503 if ATC 24 Bot is offline and 24data restarted
            log.warning("ATIS refresh failed: %s", err)

    # ---------- WebSocket ----------
    def handle_message(self, raw: str):
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return
        t, d, s = msg.get("t"), msg.get("d"), msg.get("s")

        if t == "ACFT_DATA":
            self.aircraft = d
            self.last_update = s
        elif t == "EVENT_ACFT_DATA":
            self.event_aircraft = d
        elif t in ("FLIGHT_PLAN", "EVENT_FLIGHT_PLAN"):
            self.flight_plans.append({**d, "event": t == "EVENT_FLIGHT_PLAN"})
            del self.flight_plans[:-100]
        elif t == "CONTROLLERS":
            self.controllers = d
        elif t == "ATIS":
            self.atis[d["airport"]] = d

    async def websocket_loop(self):
        delay = 1
        while True:
            try:
                # No Origin header is sent unless set, which is what the server needs.
                async with self.session.ws_connect(WSS_URL, heartbeat=30) as ws:
                    self.ws_open = True
                    delay = 1
                    log.info("24data WebSocket connected")
                    async for msg in ws:
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            self.handle_message(msg.data)
                        elif msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSED):
                            break
            except asyncio.CancelledError:
                raise
            except Exception as err:
                log.error("24data WebSocket error: %s", err)
            self.ws_open = False
            log.info("24data WebSocket closed, reconnecting in %ss", delay)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 30)

    # ---------- Fallback polling (only while the WebSocket is down) ----------
    async def poll_aircraft_loop(self):
        while True:
            await asyncio.sleep(3)
            if self.ws_open:
                continue
            for fn in (self.refresh_aircraft, self.refresh_event_aircraft):
                try:
                    await fn()
                except Exception as err:
                    log.error("Aircraft poll error: %s", err)

    async def poll_controllers_loop(self):
        while True:
            await asyncio.sleep(6)
            if self.ws_open:
                continue
            try:
                await self.refresh_controllers()
            except Exception as err:
                log.error("Controllers poll error: %s", err)
            await self.refresh_atis()

    async def start(self):
        await asyncio.gather(
            self.refresh_aircraft(),
            self.refresh_event_aircraft(),
            self.refresh_controllers(),
            self.refresh_atis(),
            return_exceptions=True,
        )
        loop = asyncio.get_running_loop()
        self.tasks = [
            loop.create_task(self.websocket_loop()),
            loop.create_task(self.poll_aircraft_loop()),
            loop.create_task(self.poll_controllers_loop()),
        ]

    async def stop(self):
        for t in self.tasks:
            t.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)


# ======================================================================
# Web server
# ======================================================================
async def index(request):
    return web.FileResponse(STATIC / "index.html")


def state_payload(d: DataClient) -> dict:
    return {
        "ws": d.ws_open,
        "ts": d.last_update,
        "main": d.aircraft,
        "event": d.event_aircraft,
    }


def meta_payload(d: DataClient) -> dict:
    return {
        "controllers": d.controllers,
        "atis": d.atis,
        "flight_plans": d.flight_plans[-50:],
    }


async def api_state(request):
    d: DataClient = request.app["data"]
    return web.json_response({**state_payload(d), **meta_payload(d)})


async def sse_send(resp: web.StreamResponse, event: str, payload: dict):
    await resp.write(f"event: {event}\ndata: {json.dumps(payload)}\n\n".encode())


async def api_stream(request):
    """Server-Sent Events: 'state' every second, 'meta' every 5 seconds."""
    d: DataClient = request.app["data"]
    resp = web.StreamResponse(headers={
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",  # stops nginx buffering the stream
    })
    await resp.prepare(request)

    tick = 0
    try:
        while True:
            await sse_send(resp, "state", state_payload(d))
            if tick % 5 == 0:
                await sse_send(resp, "meta", meta_payload(d))
            tick += 1
            await asyncio.sleep(1)
    except ConnectionResetError:
        pass
    return resp


async def on_startup(app: web.Application):
    session = aiohttp.ClientSession()
    data = DataClient(session)
    await data.start()
    app["session"] = session
    app["data"] = data


async def on_cleanup(app: web.Application):
    await app["data"].stop()
    await app["session"].close()


def make_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/", index)
    app.router.add_get("/api/state", api_state)
    app.router.add_get("/api/stream", api_stream)
    app.router.add_static("/static", STATIC)   # css/, js/, img/
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8080"))
    web.run_app(make_app(), host=host, port=port) 

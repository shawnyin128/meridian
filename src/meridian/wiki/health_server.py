from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

from meridian.wiki.health import run_wiki_health


HealthFunction = Callable[..., Any]


class HealthRunController:
    """Single-flight controller for local health UI requests."""

    def __init__(
        self,
        *,
        wiki_root: Path,
        profile: str = "daily",
        repair_plan: bool = True,
        health_function: HealthFunction = run_wiki_health,
    ) -> None:
        self.wiki_root = wiki_root.expanduser().resolve()
        self.profile = profile
        self.repair_plan = repair_plan
        self._health_function = health_function
        self._lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._status: dict[str, Any] = {
            "state": "idle",
            "running": False,
            "message": "No health check is running.",
        }

    def status(self) -> dict[str, Any]:
        with self._state_lock:
            return dict(self._status)

    def run_once(self) -> tuple[int, dict[str, Any]]:
        if not self._lock.acquire(blocking=False):
            return 409, {
                **self.status(),
                "state": "running",
                "running": True,
                "message": "A wiki health check is already running.",
            }
        try:
            with self._state_lock:
                self._status = {
                    "state": "running",
                    "running": True,
                    "message": "Running wiki health check.",
                }
            result = self._health_function(
                wiki_root=self.wiki_root,
                profile=self.profile,
                repair_plan=self.repair_plan,
            )
            payload = json.loads(result.report_path.read_text(encoding="utf-8"))
            response = {
                "state": "completed",
                "running": False,
                "message": "Wiki health check completed.",
                "health_level": payload.get("health_level"),
                "overall_score": payload.get("overall_score"),
                "main_insight": payload.get("main_insight"),
                "report_path": str(result.report_path),
                "html_path": str(result.html_path),
                "repair_plan_path": str(result.repair_plan_path) if result.repair_plan_path else None,
            }
            with self._state_lock:
                self._status = response
            return 200, response
        except Exception as error:  # pragma: no cover - defensive server boundary
            response = {
                "state": "failed",
                "running": False,
                "message": str(error),
            }
            with self._state_lock:
                self._status = response
            return 500, response
        finally:
            self._lock.release()


class HealthUIServer(ThreadingHTTPServer):
    def __init__(self, server_address: tuple[str, int], controller: HealthRunController) -> None:
        super().__init__(server_address, HealthUIHandler)
        self.controller = controller


class HealthUIHandler(BaseHTTPRequestHandler):
    server: HealthUIServer

    def do_OPTIONS(self) -> None:
        self._send_json(204, {})

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health/status":
            self._send_json(200, self.server.controller.status())
            return
        if path in {"/", "/wiki-health.html"}:
            html = self.server.controller.wiki_root / ".index" / "wiki-health.html"
            if html.exists():
                self._send_bytes(200, html.read_bytes(), content_type="text/html; charset=utf-8")
                return
            self._send_json(404, {"message": "No wiki-health.html exists yet. Run POST /api/health/run."})
            return
        self._send_json(404, {"message": "Not found."})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path != "/api/health/run":
            self._send_json(404, {"message": "Not found."})
            return
        _ = self.rfile.read(int(self.headers.get("Content-Length", "0") or "0"))
        status, payload = self.server.controller.run_once()
        self._send_json(status, payload)

    def log_message(self, format: str, *args: Any) -> None:
        return

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send_bytes(status, body, content_type="application/json; charset=utf-8")

    def _send_bytes(self, status: int, body: bytes, *, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        if status != 204:
            self.wfile.write(body)


def create_health_ui_server(
    *,
    wiki_root: Path,
    host: str = "127.0.0.1",
    port: int = 8765,
    profile: str = "daily",
    repair_plan: bool = True,
) -> HealthUIServer:
    controller = HealthRunController(wiki_root=wiki_root, profile=profile, repair_plan=repair_plan)
    return HealthUIServer((host, port), controller)


def serve_health_ui(
    *,
    wiki_root: Path,
    host: str = "127.0.0.1",
    port: int = 8765,
    profile: str = "daily",
    repair_plan: bool = True,
) -> None:
    server = create_health_ui_server(
        wiki_root=wiki_root,
        host=host,
        port=port,
        profile=profile,
        repair_plan=repair_plan,
    )
    address, bound_port = server.server_address
    print(f"Serving Meridian wiki health UI bridge at http://{address}:{bound_port}")
    print(f"Open wiki/.index/wiki-health.html or http://{address}:{bound_port}/wiki-health.html")
    print("Press Ctrl-C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped Meridian wiki health UI bridge.")
    finally:
        server.server_close()

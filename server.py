from __future__ import annotations

import http.server
import json
import os
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
UPSTREAM_COMMIT = "56c577941a41cd8826bd73d3120dbc524c1d9d3e"


class CapsuleHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/health":
            self._json({"status": "ok"})
            return
        if path == "/__ato/state":
            self._json(
                {
                    "app": "sushigoto",
                    "upstream_commit": UPSTREAM_COMMIT,
                    "demo_tasks": 3,
                    "primary_screen": "action",
                    "external_integrations": False,
                    "runtime_downloads": False,
                }
            )
            return
        if path == "/":
            self.send_response(302)
            self.send_header("Location", "/index.html?ato-demo=1")
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self) -> None:
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; "
            "base-uri 'self'; frame-ancestors *",
        )
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def _json(self, payload: dict[str, object]) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


port = int(os.environ.get("ATO_PORT", "8080"))
http.server.ThreadingHTTPServer(("0.0.0.0", port), CapsuleHandler).serve_forever()

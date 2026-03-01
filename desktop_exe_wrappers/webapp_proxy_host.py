from __future__ import annotations

import argparse
import io
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def resource_base() -> Path:
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))


def _guess_content_type(path: Path) -> str:
    suffix = path.suffix.lower()
    return {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".ico": "image/x-icon",
        ".pdf": "application/pdf",
    }.get(suffix, "application/octet-stream")


def make_handler(static_root: Path, backend_base: str):
    backend_base = backend_base.rstrip("/")

    class Handler(BaseHTTPRequestHandler):
        server_version = "SoftiBridgeDesktop/1.0"

        def log_message(self, fmt: str, *args):
            sys.stdout.write("[HTTP] " + (fmt % args) + "\n")

        def _send_bytes(self, code: int, body: bytes, content_type: str = "text/plain; charset=utf-8"):
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _read_body(self) -> bytes:
            length = int(self.headers.get("Content-Length", "0") or "0")
            if length <= 0:
                return b""
            return self.rfile.read(length)

        def _proxy_api(self):
            target = backend_base + self.path
            body = self._read_body()
            headers = {}
            for k, v in self.headers.items():
                lk = k.lower()
                if lk in {"host", "connection", "content-length"}:
                    continue
                headers[k] = v
            req = urllib.request.Request(target, data=(body if body else None), headers=headers, method=self.command)
            try:
                with urllib.request.urlopen(req, timeout=20) as resp:
                    raw = resp.read()
                    self.send_response(resp.status)
                    for k, v in resp.headers.items():
                        lk = k.lower()
                        if lk in {"transfer-encoding", "connection", "content-encoding"}:
                            continue
                        self.send_header(k, v)
                    self.end_headers()
                    self.wfile.write(raw)
            except urllib.error.HTTPError as e:
                raw = e.read()
                self.send_response(e.code)
                for k, v in e.headers.items():
                    lk = k.lower()
                    if lk in {"transfer-encoding", "connection", "content-encoding"}:
                        continue
                    self.send_header(k, v)
                self.end_headers()
                self.wfile.write(raw)
            except Exception as exc:
                payload = json.dumps({"ok": False, "error": f"Proxy backend failed: {exc}", "target": target}).encode("utf-8")
                self._send_bytes(502, payload, "application/json; charset=utf-8")

        def _serve_static(self):
            if self.path == "/__desktop_info":
                info = {
                    "ok": True,
                    "static_root": str(static_root),
                    "backend_base": backend_base,
                    "timestamp": int(time.time()),
                }
                self._send_bytes(200, json.dumps(info).encode("utf-8"), "application/json; charset=utf-8")
                return
            if self.path in {"/", ""}:
                rel = "index.html"
            else:
                rel = urllib.parse.urlparse(self.path).path.lstrip("/")
            candidate = (static_root / rel).resolve()
            try:
                candidate.relative_to(static_root.resolve())
            except Exception:
                self._send_bytes(403, b"Forbidden")
                return
            if candidate.is_dir():
                candidate = candidate / "index.html"
            if not candidate.exists():
                # SPA fallback
                fallback = static_root / "index.html"
                if fallback.exists():
                    raw = fallback.read_bytes()
                    self._send_bytes(200, raw, "text/html; charset=utf-8")
                    return
                self._send_bytes(404, b"Not Found")
                return
            raw = candidate.read_bytes()
            self._send_bytes(200, raw, _guess_content_type(candidate))

        def do_GET(self):
            if self.path.startswith("/api/"):
                self._proxy_api()
                return
            self._serve_static()

        def do_POST(self):
            if self.path.startswith("/api/"):
                self._proxy_api()
                return
            self._send_bytes(405, b"Method Not Allowed")

        def do_PATCH(self):
            if self.path.startswith("/api/"):
                self._proxy_api()
                return
            self._send_bytes(405, b"Method Not Allowed")

        def do_PUT(self):
            if self.path.startswith("/api/"):
                self._proxy_api()
                return
            self._send_bytes(405, b"Method Not Allowed")

        def do_DELETE(self):
            if self.path.startswith("/api/"):
                self._proxy_api()
                return
            self._send_bytes(405, b"Method Not Allowed")

        def do_OPTIONS(self):
            if self.path.startswith("/api/"):
                self._proxy_api()
                return
            self.send_response(204)
            self.end_headers()

    return Handler


def run_server(static_dir_name: str, default_port: int, app_title: str):
    parser = argparse.ArgumentParser(description=f"{app_title} Desktop Wrapper")
    parser.add_argument("--backend", default=os.getenv("SOFTIBRIDGE_BACKEND_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--port", type=int, default=default_port)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--no-open", action="store_true")
    args = parser.parse_args()

    static_root = resource_base() / static_dir_name
    if not static_root.exists():
        print(f"[ERR] Static root not found: {static_root}")
        sys.exit(2)

    handler_cls = make_handler(static_root=static_root, backend_base=args.backend)
    httpd = ThreadingHTTPServer((args.host, args.port), handler_cls)
    url = f"http://{args.host}:{args.port}/"

    print("=" * 68)
    print(f"{app_title} Desktop Wrapper")
    print(f"Static root : {static_root}")
    print(f"Backend API : {args.backend}")
    print(f"Local URL   : {url}")
    print("=" * 68)

    if not args.no_open:
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Arresto server locale...")
    finally:
        httpd.server_close()


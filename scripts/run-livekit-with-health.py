#!/usr/bin/env python3
"""Run LiveKit agent with a minimal HTTP health server for Cloud Run.
Cloud Run expects the container to listen on PORT; the agent connects outbound.
"""
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *args):
        pass


def run_health_server():
    port = int(os.environ.get("PORT", "8080"))
    server = HTTPServer(("0.0.0.0", port), HealthHandler)
    server.serve_forever()


def main():
    t = threading.Thread(target=run_health_server, daemon=True)
    t.start()
    sys.exit(subprocess.run([sys.executable, "-m", "agent.echo_prism.subagents.livekit.main", "start"]).returncode)


if __name__ == "__main__":
    main()

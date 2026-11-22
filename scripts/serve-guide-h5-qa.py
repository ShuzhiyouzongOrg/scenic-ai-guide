"""Serve compiled H5 and an isolated demo API on one loopback browser origin."""
import argparse
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from urllib.parse import urlsplit


def loopback(raw):
    url = urlsplit(raw)
    if url.scheme != "http" or url.hostname != "127.0.0.1" or not url.port or url.path not in ("", "/"):
        raise argparse.ArgumentTypeError("Expected http://127.0.0.1:<port>")
    return url.port


def read_upstream(port, method, path, body=None, headers=None):
    conn = HTTPConnection("127.0.0.1", port, timeout=20)
    try:
        conn.request(method, path, body=body, headers=headers or {})
        response = conn.getresponse()
        forwarded = {name: value for name, value in response.getheaders()
                     if name.lower() in {"content-type", "content-range", "accept-ranges", "content-encoding"}}
        return response.status, forwarded, response.read()
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web", type=loopback, required=True)
    parser.add_argument("--api", type=loopback, required=True)
    parser.add_argument("--port", type=int, default=7752)
    args = parser.parse_args()
    status, _, data = read_upstream(args.api, "GET", "/api/health")
    providers = json.loads(data)["data"]["providers"]
    if status != 200 or not all(providers.get(key) == "mock" for key in ("asr", "tts", "llm")):
        raise RuntimeError("Use a local mock ASR/TTS/LLM server.")
    local_origin = f"http://127.0.0.1:{args.port}".encode()

    class Handler(BaseHTTPRequestHandler):
        def forward(self):
            path = urlsplit(self.path)
            media = path.path.startswith(("/api/", "/digital-human/", "/live2d/"))
            if self.command != "GET" and not path.path.startswith("/api/"):
                self.send_error(405)
                return
            headers = {k: v for k, v in self.headers.items()
                       if k.lower() in {"content-type", "authorization", "accept", "range"}}
            body = self.rfile.read(int(self.headers.get("content-length", 0))) or None
            code, response_headers, response_body = read_upstream(
                args.api if media else args.web, self.command, self.path, body, headers)
            if not media and path.path.endswith(".js"):
                response_body = response_body.replace(b"https://api.shuzhiyouzong.cn", local_origin)
            self.send_response(code)
            for key, value in response_headers.items():
                self.send_header(key, value)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(response_body)))
            self.end_headers()
            self.wfile.write(response_body)

        do_GET = do_POST = do_DELETE = forward

        def log_message(self, fmt, *values):
            pass  # Avoid writing session keys, question text or request bodies.

    print(f"Serving isolated QA on {local_origin.decode()}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()

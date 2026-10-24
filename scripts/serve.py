"""Serve the game from the dist folder on http://localhost:8743 and open it in the browser.

Used by both launchers (開始遊戲.command on Mac, 開始遊戲.bat on Windows). Python's built-in server takes file types from the Windows registry,
which on some PCs maps .js to text/plain and stops the game's modules from loading, so the types are fixed here.
"""
import functools
import http.server
import os
import sys
import threading
import webbrowser

PORT = 8743
ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")
TYPES = {".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css",
         ".html": "text/html", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".bin": "application/octet-stream", ".glb": "model/gltf-binary"}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **TYPES}

    def log_message(self, *args):   # keep the console quiet
        pass

    def end_headers(self):
        # the page itself must never come from the browser cache, or an old index.html keeps loading an old game build
        if self.path.split('?')[0].endswith(('/', '.html')):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


def main():
    url = f"http://localhost:{PORT}/index.html"
    try:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Handler, directory=ROOT))
    except OSError:
        print("伺服器已在執行，直接開啟遊戲… / Server already running, opening the game…")
        webbrowser.open(url)
        return
    print(f"遊戲網址 / Game: {url}")
    print("關閉這個視窗即可結束 / Close this window to stop.")
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()

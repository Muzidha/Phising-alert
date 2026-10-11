#!/usr/bin/env python3
"""
Server demo LOKAL untuk PhishShield (hanya library standar Python).

Menjalankan 2 server kecil yang hanya mendengarkan di 127.0.0.1:
  :8000  "situs"     link pendek tiruan (/s/kampus) yang me-redirect 2x
                     ke halaman login tiruan (/fake-login/)
  :8001  "collector" penampung data tiruan di domain lain. Hanya mencatat
                     NAMA field; nilainya langsung dibuang.

Mode alamat:
  --mode local  (default) tanpa setting apa pun:
                link pendek di localhost, halaman login di 127.0.0.1, collector di localhost
  --mode hosts  lebih realistis, butuh baris ini di /etc/hosts:
                127.0.0.1  pendek.test login-kampus-verifikasi.free-host.test collector.ngrok-free.test

⚠️ Hanya untuk demo di komputer sendiri. Jangan dibuka ke publik dan jangan
dipakai untuk menipu orang.
"""

from __future__ import annotations

import argparse
import html
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs, urlsplit

HERE = Path(__file__).resolve().parent
FAKE_LOGIN = HERE / 'fake-login' / 'index.html'

HOSTS = {
    'local': {'short': 'localhost', 'site': '127.0.0.1', 'collector': 'localhost'},
    'hosts': {
        'short': 'pendek.test',
        'site': 'login-kampus-verifikasi.free-host.test',
        'collector': 'collector.ngrok-free.test',
    },
}


def read_field_names(handler: BaseHTTPRequestHandler) -> list[str]:
    """Baca body POST, kembalikan nama field saja (nilai tidak pernah disimpan)."""
    length = int(handler.headers.get('Content-Length') or 0)
    raw = handler.rfile.read(min(length, 1_000_000)).decode('utf-8', 'replace')
    content_type = handler.headers.get('Content-Type', '')
    if 'application/json' in content_type:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return []
        return sorted(data) if isinstance(data, dict) else []
    return sorted(parse_qs(raw, keep_blank_values=True))


def log_fields(tag: str, names: list[str]) -> None:
    print(f'  [{tag}] menerima field: {", ".join(names) or "-"} (nilai tidak dicatat)')


class BaseHandler(BaseHTTPRequestHandler):
    server_version = 'PhishShieldDemo/1.0'

    def send_body(self, status: int, body: str, content_type: str, extra_headers: dict | None = None) -> None:
        data = body.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def redirect(self, location: str) -> None:
        self.send_response(302)
        self.send_header('Location', location)
        self.send_header('Content-Length', '0')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()


def index_page(cfg: dict) -> str:
    return f"""<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Demo PhishShield</title>
<style>body{{font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px}}code{{background:#eee;padding:2px 4px;border-radius:4px}}</style>
</head><body>
<h1>Demo PhishShield (lokal)</h1>
<p>Klik link pendek tiruan ini (seolah-olah dikirim lewat chat):</p>
<p><a href="{html.escape(cfg['short_url'])}">{html.escape(cfg['short_url'])}</a></p>
<p>Link itu akan dialihkan 2 kali ke halaman login tiruan di
<code>{html.escape(cfg['site_url'])}/fake-login/</code>, yang mengirim data ke
<code>{html.escape(cfg['collector_url'])}</code> (domain berbeda).</p>
</body></html>"""


def make_site_handler(cfg: dict):
    class SiteHandler(BaseHandler):
        def do_GET(self):
            path = urlsplit(self.path).path
            if path.startswith('/s/'):
                self.redirect(f'/t/{path[3:]}')  # hop 1: "link pendek" → "tracker"
            elif path.startswith('/t/'):
                self.redirect(f"{cfg['site_url']}/fake-login/")  # hop 2: tracker → tujuan asli
            elif path in ('/fake-login', '/fake-login/', '/fake-login/index.html'):
                page = FAKE_LOGIN.read_text(encoding='utf-8').replace('{{COLLECTOR_URL}}', cfg['collector_url'])
                self.send_body(200, page, 'text/html; charset=utf-8')
            elif path == '/':
                self.send_body(200, index_page(cfg), 'text/html; charset=utf-8')
            else:
                self.send_body(404, 'Tidak ditemukan', 'text/plain; charset=utf-8')

        def do_POST(self):
            if urlsplit(self.path).path != '/collect':
                self.send_body(404, 'Tidak ditemukan', 'text/plain; charset=utf-8')
                return
            names = read_field_names(self)
            log_fields('SITUS, domain sama', names)
            self.send_body(200, json.dumps({'ok': True, 'received_fields': names}), 'application/json')

    return SiteHandler


def make_collector_handler(cfg: dict):
    cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }

    class CollectorHandler(BaseHandler):
        def do_OPTIONS(self):
            self.send_response(204)
            for key, value in cors.items():
                self.send_header(key, value)
            self.send_header('Content-Length', '0')
            self.end_headers()

        def do_POST(self):
            names = read_field_names(self)
            log_fields('COLLECTOR, domain lain', names)
            if 'text/html' in self.headers.get('Accept', ''):
                body = (
                    '<!doctype html><meta charset="utf-8"><title>Collector demo</title>'
                    '<body style="font:16px system-ui;max-width:600px;margin:40px auto">'
                    '<h1>📥 Collector demo</h1>'
                    f'<p>Server tiruan menerima field: <b>{html.escape(", ".join(names) or "-")}</b>.</p>'
                    '<p>Nilainya tidak disimpan. Di dunia nyata, di sinilah password korban berakhir.</p>'
                    f'<p><a href="{html.escape(cfg["site_url"])}/fake-login/">← kembali</a></p>'
                )
                self.send_body(200, body, 'text/html; charset=utf-8', cors)
            else:
                self.send_body(200, json.dumps({'ok': True, 'received_fields': names}), 'application/json', cors)

        def do_GET(self):
            self.send_body(200, 'Collector demo PhishShield. Kirim POST ke /collect.', 'text/plain; charset=utf-8', cors)

    return CollectorHandler


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--mode', choices=HOSTS, default='local')
    parser.add_argument('--site-port', type=int, default=8000)
    parser.add_argument('--collector-port', type=int, default=8001)
    args = parser.parse_args()

    hosts = HOSTS[args.mode]
    cfg = {
        'short_url': f"http://{hosts['short']}:{args.site_port}/s/kampus",
        'site_url': f"http://{hosts['site']}:{args.site_port}",
        'collector_url': f"http://{hosts['collector']}:{args.collector_port}",
    }

    bind = '127.0.0.1'  # sengaja hanya lokal
    site = ThreadingHTTPServer((bind, args.site_port), make_site_handler(cfg))
    collector = ThreadingHTTPServer((bind, args.collector_port), make_collector_handler(cfg))
    Thread(target=collector.serve_forever, daemon=True).start()

    print(f'Mode: {args.mode}')
    print(f'  Halaman awal   : http://localhost:{args.site_port}/')
    print(f"  Link pendek    : {cfg['short_url']}")
    print(f"  Login tiruan   : {cfg['site_url']}/fake-login/")
    print(f"  Collector      : {cfg['collector_url']}/collect")
    print('Tekan Ctrl+C untuk berhenti.\n')
    try:
        site.serve_forever()
    except KeyboardInterrupt:
        print('\nBerhenti.')
    finally:
        site.shutdown()
        collector.shutdown()


if __name__ == '__main__':
    main()

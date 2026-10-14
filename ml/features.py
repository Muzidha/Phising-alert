"""
Ekstraksi fitur URL: versi Python dari extension/features.js.

⚠️ KONTRAK: nama, urutan, dan definisi fitur di sini HARUS sama persis
dengan extension/features.js. Model dilatih memakai file ini, lalu dijalankan
di browser memakai features.js. Kalau keduanya beda, model tidak berguna.
Cek kecocokannya di halaman extension/ui/selftest.html setelah ekspor.

Browser selalu menormalisasi URL (huruf kecil di host, tambah "/" di path
kosong, buang port default, punycode, percent-encoding, dll). Fungsi
`canonicalize` meniru perilaku itu supaya URL mentah dari dataset
menghasilkan angka yang sama dengan `location.href` di browser.

Cakupan URL (`scope`), disimpan di model.json sebagai "url_scope":
  'full'  seluruh URL dinilai (tanpa #fragment).
  'host'  hanya skema://[userinfo@]host[:port]/, dengan awalan "www." dibuang.
          Path & query diabaikan. Dipakai karena di dataset PhiUSIIL semua URL
          legit berbentuk https://www.domain tanpa path, sehingga model mode
          'full' belajar "punya path / tanpa www = phishing".

Hanya memakai library standar Python.
"""

from __future__ import annotations

import ipaddress
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Iterable, NamedTuple
from urllib.parse import quote, urlsplit

REPO_ROOT = Path(__file__).resolve().parent.parent
SUFFIX_FILE = REPO_ROOT / 'extension' / 'lib' / 'suffix-list.js'

FEATURE_NAMES = [
    # Fitur inti (rancangan bagian 6.2)
    'URLLength',       # panjang URL
    'NumDots',         # jumlah "."
    'HasIP',           # host berupa alamat IP
    'SubdomainCount',  # jumlah label sebelum domain inti
    'HasAtSymbol',     # ada "@"
    'NumHyphens',      # jumlah "-"
    'IsHTTPS',         # skema https
    # Fitur tambahan (opsional)
    'HostLength',      # panjang hostname
    'PathLength',      # panjang path
    'NumDigits',       # jumlah digit 0-9 di URL
    'NumQueryParams',  # jumlah parameter query
    'HasPunycode',     # ada label "xn--"
    'IsFreeHosting',   # host di layanan hosting gratis (web.app, weebly.com, ...)
]
CORE_FEATURES = FEATURE_NAMES[:7]
URL_SCOPES = ('full', 'host')

_SCHEME_RE = re.compile(r'^[a-zA-Z][a-zA-Z0-9+.-]*://')
_IPV4_RE = re.compile(r'([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})')
_DEFAULT_PORTS = {'http': 80, 'https': 443}
# Karakter yang TIDAK di-percent-encode browser (WHATWG URL Standard)
_PATH_SAFE = "!$%&'()*+,-./:;=@[\\]^_|~"
_QUERY_SAFE = "!$%&()*+,-./:;=?@[\\]^_`{|}~"
_USERINFO_SAFE = "!$%&'()*+,-._~"


# ------------------------------------------------------------
# Domain (sama dengan extension/lib/domain.js)
# ------------------------------------------------------------

def _read_json_block(name: str) -> frozenset[str]:
    """Baca array JSON di antara penanda // @<name>-start dan // @<name>-end di suffix-list.js."""
    text = SUFFIX_FILE.read_text(encoding='utf-8')
    try:
        body = text.split(f'// @{name}-start', 1)[1].split(f'// @{name}-end', 1)[0]
    except IndexError as exc:
        raise RuntimeError(f'Penanda @{name}-start/@{name}-end tidak ditemukan di {SUFFIX_FILE}') from exc
    return frozenset(json.loads(body))


@lru_cache(maxsize=1)
def load_suffixes() -> frozenset[str]:
    """Baca daftar suffix dari extension/lib/suffix-list.js (satu sumber untuk JS & Python)."""
    return _read_json_block('json')


@lru_cache(maxsize=1)
def load_free_hosting() -> frozenset[str]:
    """Baca daftar layanan hosting gratis dari extension/lib/suffix-list.js."""
    return _read_json_block('hosting')


def normalize_host(host: str) -> str:
    h = (host or '').strip().lower()
    if h.startswith('[') and h.endswith(']'):
        h = h[1:-1]
    if h.endswith('.'):
        h = h[:-1]
    return h


def is_ip_address(host: str) -> bool:
    h = normalize_host(host)
    if ':' in h:  # IPv6
        return True
    m = _IPV4_RE.fullmatch(h)
    return bool(m) and all(int(octet) <= 255 for octet in m.groups())


def get_registrable_domain(host: str) -> str:
    h = normalize_host(host)
    if not h or is_ip_address(h):
        return h
    labels = h.split('.')
    if len(labels) <= 2:
        return h
    suffixes = load_suffixes()
    for i in range(1, len(labels)):
        if '.'.join(labels[i:]) in suffixes:
            return '.'.join(labels[i - 1:])
    return '.'.join(labels[-2:])


# ------------------------------------------------------------
# Kanonikalisasi URL (meniru parser URL browser)
# ------------------------------------------------------------

class CanonicalUrl(NamedTuple):
    href: str
    scheme: str
    host: str   # tanpa kurung IPv6, tanpa port
    path: str
    query: str  # tanpa "?"


def _parse_ipv4_number(part: str) -> int | None:
    radix = 10
    if part[:2].lower() == '0x':
        radix, part = 16, part[2:]
    elif len(part) > 1 and part[0] == '0':
        radix, part = 8, part[1:]
    if part == '':
        return 0
    try:
        return int(part, radix)
    except ValueError:
        return None


def _whatwg_ipv4(host: str) -> str | None:
    """Browser membaca '0x7f.1' atau '2130706433' sebagai 127.0.0.1. None = bukan IPv4."""
    parts = host.split('.')
    if len(parts) > 1 and parts[-1] == '':
        parts.pop()
    if not parts or len(parts) > 4:
        return None
    last = parts[-1]
    if not (re.fullmatch(r'[0-9]+', last) or re.fullmatch(r'0[xX][0-9a-fA-F]*', last)):
        return None
    if any(p == '' for p in parts):
        return None
    numbers = [_parse_ipv4_number(p) for p in parts]
    if any(n is None for n in numbers) or any(n > 255 for n in numbers[:-1]):
        return None
    if numbers[-1] >= 256 ** (5 - len(numbers)):
        return None
    value = numbers[-1]
    for i, n in enumerate(numbers[:-1]):
        value += n * 256 ** (3 - i)
    return '.'.join(str((value >> shift) & 255) for shift in (24, 16, 8, 0))


def _to_ascii(host: str) -> str:
    try:
        return host.encode('idna').decode('ascii')
    except UnicodeError:
        return host


def _remove_dot_segments(path: str) -> str:
    segments = path.split('/')[1:]
    out: list[str] = []
    for i, seg in enumerate(segments):
        low = seg.lower()
        is_last = i == len(segments) - 1
        if low in ('.', '%2e'):
            if is_last:
                out.append('')
        elif low in ('..', '.%2e', '%2e.', '%2e%2e'):
            if out:
                out.pop()
            if is_last:
                out.append('')
        else:
            out.append(seg)
    return '/' + '/'.join(out)


def strip_www(host: str) -> str:
    """'www.contoh.com' → 'contoh.com' (sama dengan stripWww di features.js)."""
    if host.startswith('www.') and '.' in host[4:]:
        return host[4:]
    return host


def _check_scope(scope: str) -> None:
    if scope not in URL_SCOPES:
        raise ValueError(f'scope harus salah satu dari {URL_SCOPES}, dapat: {scope!r}')


def canonicalize(url: str, scope: str = 'full') -> CanonicalUrl:
    """Raise ValueError kalau URL tidak valid (baris seperti itu dibuang saat training)."""
    _check_scope(scope)
    s = re.sub(r'[\t\n\r]', '', str(url)).strip()
    if not _SCHEME_RE.match(s):
        s = 'http://' + s  # sama dengan features.js
    s = s.split('#', 1)[0]
    scheme = s.split('://', 1)[0].lower()
    if scheme not in _DEFAULT_PORTS:
        raise ValueError(f'Skema tidak didukung: {scheme}')
    s = s.replace('\\', '/')  # browser memperlakukan "\" sebagai "/" di http(s)

    parts = urlsplit(s)
    host = parts.hostname or ''
    if not host:
        raise ValueError('URL tanpa host')
    port = parts.port  # ValueError kalau port tidak valid

    if ':' in host:
        host = ipaddress.IPv6Address(host).compressed
        host_out = f'[{host}]'
    else:
        host = _whatwg_ipv4(host) or _to_ascii(host)
        if scope == 'host':
            host = strip_www(host)
        host_out = host
    if port is not None and port != _DEFAULT_PORTS[scheme]:
        host_out += f':{port}'

    userinfo = ''
    if '@' in parts.netloc:
        user, _, password = parts.netloc.rpartition('@')[0].partition(':')
        userinfo = quote(user, safe=_USERINFO_SAFE)
        if password:  # browser membuang password kosong ("user:@host" → "user@host")
            userinfo += ':' + quote(password, safe=_USERINFO_SAFE)
    netloc = f'{userinfo}@{host_out}' if userinfo else host_out

    if scope == 'host':
        path, query, has_query = '/', '', False
    else:
        path = quote(_remove_dot_segments(parts.path or '/'), safe=_PATH_SAFE)
        has_query = '?' in s.split('://', 1)[1]
        query = quote(parts.query, safe=_QUERY_SAFE)
    href = f'{scheme}://{netloc}{path}' + (f'?{query}' if has_query else '')
    return CanonicalUrl(href=href, scheme=scheme, host=host, path=path, query=query)


def try_canonical(url: str, scope: str = 'full') -> str | None:
    """URL kanonik sebagai string, atau None kalau tidak valid."""
    _check_scope(scope)
    try:
        return canonicalize(url, scope).href
    except (ValueError, TypeError):
        return None


# ------------------------------------------------------------
# Fitur
# ------------------------------------------------------------

def extract_features(url: str, scope: str = 'full') -> dict[str, int]:
    c = canonicalize(url, scope)
    href = c.href
    host = normalize_host(c.host)
    host_is_ip = is_ip_address(host)
    registrable = get_registrable_domain(host)
    return {
        'URLLength': len(href),
        'NumDots': href.count('.'),
        'HasIP': int(host_is_ip),
        'SubdomainCount': 0 if host_is_ip or not host else len(host.split('.')) - len(registrable.split('.')),
        'HasAtSymbol': int('@' in href),
        'NumHyphens': href.count('-'),
        'IsHTTPS': int(c.scheme == 'https'),
        'HostLength': len(host),
        'PathLength': len(c.path),
        'NumDigits': sum(ch in '0123456789' for ch in href),
        'NumQueryParams': len([p for p in c.query.split('&') if p]) if c.query else 0,
        'HasPunycode': int(any(label.startswith('xn--') for label in host.split('.'))),
        'IsFreeHosting': int(any(host == d or host.endswith('.' + d) for d in load_free_hosting())),
    }


def try_extract(url: str, scope: str = 'full') -> dict[str, int] | None:
    _check_scope(scope)  # scope salah = bug, jangan disembunyikan
    try:
        return extract_features(url, scope)
    except (ValueError, TypeError):
        return None


def extract_many(urls: Iterable[str], scope: str = 'full') -> list[dict[str, int] | None]:
    """Fitur untuk banyak URL; None untuk URL yang tidak valid."""
    _check_scope(scope)
    return [try_extract(u, scope) for u in urls]


def canonical_many(urls: Iterable[str], scope: str = 'full') -> list[str | None]:
    """URL kanonik untuk banyak URL; None untuk URL yang tidak valid."""
    _check_scope(scope)
    return [try_canonical(u, scope) for u in urls]


if __name__ == '__main__':
    import sys

    for arg in sys.argv[1:] or ['https://integra.its.ac.id/login', 'http://127.0.0.1:8000/fake-login/']:
        for scope in URL_SCOPES:
            print(f'[{scope}]', canonicalize(arg, scope).href)
            print(json.dumps(extract_features(arg, scope)))

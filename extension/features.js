// ============================================================
// features.js — Ubah URL menjadi angka-angka (fitur) untuk model ML
//
// ⚠️ KONTRAK: nama, urutan, dan definisi fitur di sini HARUS sama persis
// dengan ml/features.py. Kalau mengubah salah satu, ubah juga yang lain,
// latih ulang model, lalu cek di ui/selftest.html.
//
// Semua fitur bilangan bulat supaya perbandingan "x <= threshold" di
// JavaScript dan scikit-learn memberi hasil yang identik.
//
// Cakupan URL (scope), diambil dari "url_scope" di model.json:
//   'full'  seluruh URL dinilai (tanpa #fragment).
//   'host'  hanya skema://[userinfo@]host[:port]/, awalan "www." dibuang;
//           path & query diabaikan (lihat penjelasan di ml/features.py).
// ============================================================

(function (PS) {
  'use strict';

  const { normalizeHost, isIpAddress, getRegistrableDomain, hostMatchesDomain } = PS.domain;
  const FREE_HOSTING = PS.freeHosting || [];

  const FEATURE_NAMES = [
    // Fitur inti (rancangan bagian 6.2)
    'URLLength',      // panjang URL
    'NumDots',        // jumlah "."
    'HasIP',          // host berupa alamat IP
    'SubdomainCount', // jumlah label sebelum domain inti
    'HasAtSymbol',    // ada "@"
    'NumHyphens',     // jumlah "-"
    'IsHTTPS',        // skema https
    // Fitur tambahan (opsional, aktifkan di ml/train.ipynb kalau mau)
    'HostLength',     // panjang hostname
    'PathLength',     // panjang path
    'NumDigits',      // jumlah digit 0-9 di URL
    'NumQueryParams', // jumlah parameter query
    'HasPunycode',    // ada label "xn--" (domain berhuruf mirip)
    'IsFreeHosting',  // host di layanan hosting gratis (web.app, weebly.com, ...)
  ];

  const URL_SCOPES = ['full', 'host'];
  const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

  /** "www.contoh.com" → "contoh.com" (sama dengan strip_www di ml/features.py). */
  function stripWww(host) {
    return host.startsWith('www.') && host.slice(4).includes('.') ? host.slice(4) : host;
  }

  /** URL kanonik: dinormalisasi oleh parser URL browser, tanpa #fragment. */
  function canonicalUrl(input, scope = 'full') {
    if (!URL_SCOPES.includes(scope)) throw new Error(`scope tidak dikenal: ${scope}`);
    let s = String(input).trim();
    if (!SCHEME_RE.test(s)) s = 'http://' + s; // sama dengan ml/features.py
    const u = new URL(s);
    u.hash = '';
    if (scope === 'host') {
      if (!u.hostname.startsWith('[')) u.hostname = stripWww(u.hostname);
      u.pathname = '/';
      u.search = '';
    }
    return u;
  }

  const countChar = (s, ch) => s.split(ch).length - 1;

  function extractFeatures(input, scope = 'full') {
    const u = canonicalUrl(input, scope);
    const href = u.href;
    const host = normalizeHost(u.hostname);
    const hostIsIp = isIpAddress(host);
    const registrable = getRegistrableDomain(host);
    const query = u.search.startsWith('?') ? u.search.slice(1) : u.search;

    return {
      URLLength: href.length,
      NumDots: countChar(href, '.'),
      HasIP: hostIsIp ? 1 : 0,
      SubdomainCount: hostIsIp || !host ? 0 : host.split('.').length - registrable.split('.').length,
      HasAtSymbol: href.includes('@') ? 1 : 0,
      NumHyphens: countChar(href, '-'),
      IsHTTPS: u.protocol === 'https:' ? 1 : 0,
      HostLength: host.length,
      PathLength: u.pathname.length,
      NumDigits: (href.match(/[0-9]/g) || []).length,
      NumQueryParams: query ? query.split('&').filter(Boolean).length : 0,
      HasPunycode: host.split('.').some((label) => label.startsWith('xn--')) ? 1 : 0,
      IsFreeHosting: FREE_HOSTING.some((d) => hostMatchesDomain(host, d)) ? 1 : 0,
    };
  }

  PS.features = { FEATURE_NAMES, URL_SCOPES, canonicalUrl, extractFeatures };
})(globalThis.PhishShield = globalThis.PhishShield || {});

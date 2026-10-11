// ============================================================
// features.js — Ubah URL menjadi angka-angka (fitur) untuk model ML
//
// ⚠️ KONTRAK: nama, urutan, dan definisi fitur di sini HARUS sama persis
// dengan ml/features.py. Kalau mengubah salah satu, ubah juga yang lain,
// latih ulang model, lalu cek di ui/selftest.html.
//
// Semua fitur bilangan bulat supaya perbandingan "x <= threshold" di
// JavaScript dan scikit-learn memberi hasil yang identik.
// ============================================================

(function (PS) {
  'use strict';

  const { normalizeHost, isIpAddress, getRegistrableDomain } = PS.domain;

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
  ];

  const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

  /** URL kanonik: dinormalisasi oleh parser URL browser, tanpa #fragment. */
  function canonicalUrl(input) {
    let s = String(input).trim();
    if (!SCHEME_RE.test(s)) s = 'http://' + s; // sama dengan ml/features.py
    const u = new URL(s);
    u.hash = '';
    return u;
  }

  const countChar = (s, ch) => s.split(ch).length - 1;

  function extractFeatures(input) {
    const u = canonicalUrl(input);
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
    };
  }

  PS.features = { FEATURE_NAMES, canonicalUrl, extractFeatures };
})(globalThis.PhishShield = globalThis.PhishShield || {});

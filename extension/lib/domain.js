// ============================================================
// lib/domain.js — Utilitas nama domain
// Dipakai oleh background, content script, popup, dan halaman uji.
// Versi Python-nya ada di ml/features.py (harus tetap sama perilakunya).
// ============================================================

(function (PS) {
  'use strict';

  const SUFFIXES = new Set(PS.suffixes || []);
  const IPV4_RE = /^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/;

  /** Huruf kecil, buang kurung IPv6 dan titik di akhir. */
  function normalizeHost(host) {
    let h = String(host || '').trim().toLowerCase();
    if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
    if (h.endsWith('.')) h = h.slice(0, -1);
    return h;
  }

  function isIpAddress(host) {
    const h = normalizeHost(host);
    if (h.includes(':')) return true; // IPv6
    const m = IPV4_RE.exec(h);
    return !!m && m.slice(1).every((octet) => Number(octet) <= 255);
  }

  /**
   * Domain inti (registrable domain / eTLD+1).
   * Akhiran terpanjang yang ada di daftar suffix menang; kalau tidak ada,
   * pakai 2 label terakhir.
   */
  function getRegistrableDomain(host) {
    const h = normalizeHost(host);
    if (!h || isIpAddress(h)) return h;
    const labels = h.split('.');
    if (labels.length <= 2) return h;
    for (let i = 1; i < labels.length; i++) {
      if (SUFFIXES.has(labels.slice(i).join('.'))) return labels.slice(i - 1).join('.');
    }
    return labels.slice(-2).join('.');
  }

  /**
   * true kalau host sama dengan domain atau subdomain-nya.
   * Pakai pencocokan akhiran berbasis titik, bukan includes():
   * "its.ac.id.evil.com" TIDAK cocok dengan "its.ac.id".
   */
  function hostMatchesDomain(host, domain) {
    const h = normalizeHost(host);
    const d = normalizeHost(domain);
    return !!d && (h === d || h.endsWith('.' + d));
  }

  function isSameSite(hostA, hostB) {
    return getRegistrableDomain(hostA) === getRegistrableDomain(hostB);
  }

  function hostnameOf(url, base) {
    try {
      return new URL(url, base).hostname;
    } catch {
      return '';
    }
  }

  PS.domain = { normalizeHost, isIpAddress, getRegistrableDomain, hostMatchesDomain, isSameSite, hostnameOf };
})(globalThis.PhishShield = globalThis.PhishShield || {});

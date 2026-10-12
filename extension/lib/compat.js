// ============================================================
// lib/compat.js — Satu kode untuk Chrome, Edge, Opera, Brave, Firefox, Safari
//
// Firefox & Safari menyediakan API ekstensi di namespace `browser.*`
// (berbasis Promise). Chrome hanya menyediakan `chrome.*` (di Manifest V3
// juga berbasis Promise). Semua file PhishShield memakai `browser.*`, jadi
// di Chrome kita samakan: browser = chrome.
//
// ⚠️ File ini harus dimuat PALING AWAL di setiap konteks: content script
// (manifest.json), background (manifest.json + importScripts di
// background.js), popup.html, dan selftest.html.
// ============================================================

if (typeof globalThis.browser === 'undefined' && typeof globalThis.chrome !== 'undefined') {
  globalThis.browser = globalThis.chrome;
}

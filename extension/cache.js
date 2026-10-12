// ============================================================
// cache.js — Cache hasil model per halaman (URL tanpa #fragment) di
// browser.storage.local, kedaluwarsa setelah config.cache.ttlMs.
// ============================================================

(function (PS) {
  'use strict';

  const STORAGE_KEY = 'scoreCache';
  let memory = null; // salinan di memori; hilang saat service worker tidur

  async function load() {
    if (!memory) {
      const stored = await browser.storage.local.get(STORAGE_KEY);
      memory = stored[STORAGE_KEY] || {};
    }
    return memory;
  }

  function keyFor(url) {
    const u = new URL(url);
    return u.origin + u.pathname + u.search; // fitur seperti URLLength ikut bergantung pada query
  }

  function prune(all) {
    const keys = Object.keys(all);
    const excess = keys.length - PS.config.cache.maxEntries;
    if (excess <= 0) return;
    keys
      .sort((a, b) => all[a].ts - all[b].ts)
      .slice(0, excess)
      .forEach((key) => delete all[key]);
  }

  async function get(url) {
    const all = await load();
    const key = keyFor(url);
    const entry = all[key];
    if (!entry) return null;
    if (Date.now() - entry.ts > PS.config.cache.ttlMs) {
      delete all[key];
      return null;
    }
    return entry.value;
  }

  async function set(url, value) {
    const all = await load();
    all[keyFor(url)] = { ts: Date.now(), value };
    prune(all);
    await browser.storage.local.set({ [STORAGE_KEY]: all });
  }

  async function clear() {
    memory = {};
    await browser.storage.local.remove(STORAGE_KEY);
  }

  PS.cache = { get, set, clear };
})(globalThis.PhishShield = globalThis.PhishShield || {});

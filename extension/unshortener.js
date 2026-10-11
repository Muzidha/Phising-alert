// ============================================================
// unshortener.js — Rantai redirect & URL tujuan akhir (Pilar 1)
//
// 1. Pelacak otomatis: mengamati redirect navigasi utama tiap tab lewat
//    chrome.webRequest (mode baca saja) + chrome.webNavigation (untuk
//    client redirect seperti meta refresh / location.href). Tidak ada request
//    tambahan, jadi tidak ada data yang dikirim ke mana pun.
// 2. resolve(url): dipakai tombol "Cek link" di popup untuk melihat tujuan
//    link pendek SEBELUM dibuka (ini memang menghubungi server link itu).
// ============================================================

(function (PS) {
  'use strict';

  const STORE_PREFIX = 'nav:';
  const CLIENT_REDIRECT_WINDOW_MS = 15000;
  const MAX_CHAIN = 20;

  // tabId → { requestId, chain, prevChain, prevCommittedAt, committedAt }
  const tabs = new Map();
  let restored = null;

  // Service worker bisa mati kapan saja; simpan salinan di storage.session.
  function restore() {
    if (!restored) {
      restored = chrome.storage.session
        .get(null)
        .then((all) => {
          for (const [key, value] of Object.entries(all)) {
            if (!key.startsWith(STORE_PREFIX)) continue;
            const tabId = Number(key.slice(STORE_PREFIX.length));
            if (!tabs.has(tabId)) tabs.set(tabId, value);
          }
        })
        .catch(() => {});
    }
    return restored;
  }

  function persist(tabId) {
    const key = STORE_PREFIX + tabId;
    const state = tabs.get(tabId);
    const op = state ? chrome.storage.session.set({ [key]: state }) : chrome.storage.session.remove(key);
    op.catch(() => {});
  }

  function handle(fn) {
    restore()
      .then(fn)
      .catch((err) => console.warn('[PhishShield] Pelacak redirect:', err));
  }

  function withoutHash(url) {
    try {
      const u = new URL(url);
      u.hash = '';
      return u.href;
    } catch {
      return String(url);
    }
  }

  /** Daftarkan listener. Harus dipanggil sinkron di top-level background.js. */
  function install() {
    const filter = { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] };

    chrome.webRequest.onBeforeRequest.addListener((details) => {
      handle(() => {
        if (details.tabId < 0) return;
        const prev = tabs.get(details.tabId);
        if (prev && prev.requestId === details.requestId) return; // lanjutan redirect yang sama
        tabs.set(details.tabId, {
          requestId: details.requestId,
          chain: [details.url],
          prevChain: prev ? prev.chain : null,
          prevCommittedAt: prev ? prev.committedAt || 0 : 0,
          committedAt: 0,
        });
        persist(details.tabId);
      });
    }, filter);

    chrome.webRequest.onBeforeRedirect.addListener((details) => {
      handle(() => {
        const state = tabs.get(details.tabId);
        if (!state || state.requestId !== details.requestId) return;
        state.chain.push(details.redirectUrl);
        state.chain = state.chain.slice(-MAX_CHAIN);
        persist(details.tabId);
      });
    }, filter);

    chrome.webNavigation.onCommitted.addListener((details) => {
      if (details.frameId !== 0) return;
      handle(() => {
        const state = tabs.get(details.tabId);
        if (!state) return;
        const isClientRedirect = (details.transitionQualifiers || []).includes('client_redirect');
        if (isClientRedirect && state.prevChain && Date.now() - state.prevCommittedAt < CLIENT_REDIRECT_WINDOW_MS) {
          state.chain = state.prevChain.concat(state.chain).slice(-MAX_CHAIN);
        }
        state.prevChain = null;
        state.committedAt = Date.now();
        persist(details.tabId);
      });
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      tabs.delete(tabId);
      persist(tabId);
    });
  }

  /** Rantai redirect yang berakhir di `url` untuk tab ini, atau [url] kalau tidak ada. */
  async function getChain(tabId, url) {
    await restore();
    const state = tabs.get(tabId);
    if (state && state.chain.length && withoutHash(state.chain[state.chain.length - 1]) === withoutHash(url)) {
      return state.chain.slice();
    }
    return [url];
  }

  /** Ikuti redirect sebuah link dan kembalikan URL akhirnya. */
  async function resolve(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const options = { redirect: 'follow', credentials: 'omit', cache: 'no-store', signal: controller.signal };
    try {
      let res = null;
      try {
        res = await fetch(url, { ...options, method: 'HEAD' });
        if (res.status === 405 || res.status === 501) res = null; // server menolak HEAD
      } catch (err) {
        if (controller.signal.aborted) throw err;
      }
      if (!res) {
        res = await fetch(url, { ...options, method: 'GET' });
        if (res.body) res.body.cancel().catch(() => {});
      }
      const finalUrl = res.url || url;
      return { finalUrl, redirected: res.redirected || withoutHash(finalUrl) !== withoutHash(url) };
    } finally {
      clearTimeout(timer);
    }
  }

  PS.redirects = { install, getChain, resolve };
})(globalThis.PhishShield = globalThis.PhishShield || {});

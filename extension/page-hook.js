// ============================================================
// page-hook.js — Berjalan di "MAIN world" (konteks JavaScript halaman)
//
// Kenapa file terpisah? Content script biasa hidup di "isolated world":
// kalau ia mengganti window.fetch, fetch milik halaman TIDAK ikut berubah.
// Supaya fetch / XMLHttpRequest / form.submit() dari JavaScript halaman bisa
// dipantau, pembungkusnya harus dipasang di dunia halaman itu sendiri.
//
// File ini sengaja "bodoh": ia hanya menahan request lintas-origin yang
// membawa data, lalu bertanya ke content.js lewat window.postMessage.
// Semua keputusan (cek domain, data sensitif, skor, tampilan alert) ada di
// content.js yang terisolasi dari halaman.
//
// Keterbatasan (rancangan 5.3 cara A): halaman yang sangat canggih tetap bisa
// melewati ini (iframe, sendBeacon, WebSocket, dll).
// ============================================================

(() => {
  'use strict';

  const MSG = {
    REQ: 'phishshield:hook-request',
    ACK: 'phishshield:hook-ack',
    RES: 'phishshield:hook-response',
  };
  const ACK_TIMEOUT_MS = 1000; // content script tidak menjawab → jangan rusak halaman
  const MAX_FIELDS = 200;
  const MAX_VALUE = 500;

  const nativeFetch = window.fetch;
  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  const nativeSubmit = HTMLFormElement.prototype.submit;
  const getAttr = Element.prototype.getAttribute;
  const setAttr = Element.prototype.setAttribute;
  const removeAttr = Element.prototype.removeAttribute;
  const post = window.postMessage.bind(window);

  const pending = new Map();
  let seq = 0;

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || typeof event.data !== 'object') return;
    const entry = pending.get(event.data.id);
    if (!entry) return;
    if (event.data.type === MSG.ACK) {
      clearTimeout(entry.timer); // content script sudah terima, tunggu keputusan pengguna
    } else if (event.data.type === MSG.RES) {
      clearTimeout(entry.timer);
      pending.delete(event.data.id);
      entry.resolve(event.data.allow === true);
    }
  });

  /** Tanya content.js. Resolve true = boleh dikirim. */
  function ask(kind, url, method, fields, id = `ps-${Date.now()}-${++seq}`) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(true);
      }, ACK_TIMEOUT_MS);
      pending.set(id, { resolve, timer });
      post({ type: MSG.REQ, id, kind, url, method, fields }, '*');
    });
  }

  function absoluteUrl(url) {
    try {
      return new URL(url, location.href).href;
    } catch {
      return null;
    }
  }

  function isCrossOrigin(url) {
    try {
      return new URL(url, location.href).origin !== location.origin;
    } catch {
      return false;
    }
  }

  // ---------- Ubah body request menjadi daftar { name, value } ----------

  function pushField(out, name, value) {
    if (out.length >= MAX_FIELDS) return;
    out.push({ name: String(name), value: String(value).slice(0, MAX_VALUE) });
  }

  function fromEntries(entries) {
    const out = [];
    for (const [name, value] of entries) {
      if (typeof value === 'string') pushField(out, name, value); // File/Blob dilewati
    }
    return out;
  }

  function flattenJson(value, prefix, out, depth) {
    if (out.length >= MAX_FIELDS || depth > 5) return out;
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        flattenJson(child, prefix ? `${prefix}.${key}` : key, out, depth + 1);
      }
    } else if (value !== null && value !== undefined) {
      pushField(out, prefix, value);
    }
    return out;
  }

  function fieldsFromString(text) {
    const trimmed = text.trim();
    if (!trimmed) return [];
    if (trimmed[0] === '{' || trimmed[0] === '[') {
      try {
        return flattenJson(JSON.parse(trimmed), '', [], 0);
      } catch { /* bukan JSON */ }
    }
    if (trimmed.includes('=')) {
      try {
        return fromEntries(new URLSearchParams(trimmed).entries());
      } catch { /* bukan form-urlencoded */ }
    }
    return [{ name: '', value: trimmed.slice(0, MAX_VALUE) }];
  }

  function fieldsFromBody(body) {
    if (body == null) return [];
    if (typeof body === 'string') return fieldsFromString(body);
    if (body instanceof URLSearchParams) return fromEntries(body.entries());
    if (body instanceof FormData) return fromEntries(body.entries());
    return []; // Blob / ArrayBuffer / stream tidak dianalisis
  }

  // ---------- fetch() ----------

  window.fetch = function (input, init) {
    let url;
    let method;
    try {
      const isRequest = input instanceof Request;
      url = isRequest ? input.url : String(input);
      method = String((init && init.method) || (isRequest ? input.method : 'GET')).toUpperCase();
    } catch {
      return nativeFetch.apply(window, arguments);
    }
    if (method === 'GET' || method === 'HEAD' || !isCrossOrigin(url)) {
      return nativeFetch.apply(window, arguments);
    }

    const args = arguments;
    return (async () => {
      let fields = [];
      try {
        if (init && init.body !== undefined) fields = fieldsFromBody(init.body);
        else if (input instanceof Request) fields = fieldsFromString(await input.clone().text());
      } catch { /* body tidak bisa dibaca */ }

      if (fields.length > 0) {
        const allow = await ask('fetch', absoluteUrl(url), method, fields);
        if (!allow) throw new TypeError('Failed to fetch (dibatalkan oleh PhishShield)');
      }
      return nativeFetch.apply(window, args);
    })();
  };

  // ---------- XMLHttpRequest ----------

  const xhrInfo = new WeakMap();

  XMLHttpRequest.prototype.open = function (method, url, async) {
    xhrInfo.set(this, {
      method: String(method || 'GET').toUpperCase(),
      url: String(url),
      async: arguments.length < 3 || async !== false,
    });
    return nativeOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const info = xhrInfo.get(this);
    // XHR sinkron tidak bisa ditunda → dibiarkan lewat
    if (!info || !info.async || info.method === 'GET' || info.method === 'HEAD' || !isCrossOrigin(info.url)) {
      return nativeSend.apply(this, arguments);
    }
    let fields = [];
    try {
      fields = fieldsFromBody(body);
    } catch { /* abaikan */ }
    if (fields.length === 0) return nativeSend.apply(this, arguments);

    const xhr = this;
    const args = arguments;
    ask('xhr', absoluteUrl(info.url), info.method, fields).then((allow) => {
      if (allow) {
        nativeSend.apply(xhr, args);
      } else {
        xhr.dispatchEvent(new ProgressEvent('error'));
        xhr.dispatchEvent(new ProgressEvent('loadend'));
      }
    });
  };

  // ---------- form.submit() dari JavaScript (tidak memicu event "submit") ----------

  HTMLFormElement.prototype.submit = function () {
    const form = this;
    const raw = getAttr.call(form, 'action');
    const action = raw ? absoluteUrl(raw) : location.href;
    if (!action || !isCrossOrigin(action)) return nativeSubmit.call(form);

    // content.js membaca field form ini sendiri lewat atribut penanda
    const id = `ps-${Date.now()}-${++seq}`;
    setAttr.call(form, 'data-phishshield-submit', id);
    const method = String(getAttr.call(form, 'method') || 'GET').toUpperCase();
    ask('form-js', action, method, [], id).then((allow) => {
      removeAttr.call(form, 'data-phishshield-submit');
      if (allow) nativeSubmit.call(form);
    });
  };
})();

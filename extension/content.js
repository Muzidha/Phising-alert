// ============================================================
// content.js — Berjalan di setiap halaman (isolated world)
//
// Tugas:
//   1. Minta Risk Score halaman ini ke background.
//   2. Skor sedang/tinggi → banner pasif kecil di pojok (halaman tetap bisa dipakai).
//   3. Pantau pengiriman data:
//        • submit form HTML biasa (di sini)
//        • fetch / XHR / form.submit() dari JS (lewat page-hook.js)
//      Kalau data sensitif mau dikirim ke domain lain → Transparency Alert.
//
// Prinsip: diam kalau aman, bersuara hanya kalau benar-benar perlu.
// ============================================================

(function () {
  'use strict';

  const PS = globalThis.PhishShield;
  const { getRegistrableDomain, hostnameOf } = PS.domain;

  const HOOK = {
    REQ: 'phishshield:hook-request',
    ACK: 'phishshield:hook-ack',
    RES: 'phishshield:hook-response',
  };

  // ============================================================
  // 1. RISK SCORE HALAMAN
  // ============================================================

  let verdict = null;
  let verdictPromise = requestVerdict();

  function requestVerdict() {
    return browser.runtime
      .sendMessage({ type: 'GET_VERDICT', url: location.href })
      .then((v) => {
        verdict = v && !v.skipped && v.thresholds ? v : null;
        if (v && v.error) console.warn('[PhishShield]', v.error);
        return verdict;
      })
      .catch((err) => {
        console.warn('[PhishShield] Gagal mendapat skor risiko:', err);
        return null;
      });
  }

  /** Form/request dipantau kalau skor ≥ ambang "waspada" (atau mode ketat aktif). */
  function shouldMonitor(v) {
    if (!v || v.disabled || v.trusted) return false;
    return v.strictMode || v.score >= v.thresholds.warn;
  }

  const isSameSite = (host) => getRegistrableDomain(host) === getRegistrableDomain(location.hostname);

  // ============================================================
  // 2. UI DI DALAM SHADOW DOM (tidak bentrok dengan CSS halaman)
  // ============================================================

  let uiRootPromise = null;

  function getUiRoot() {
    if (!uiRootPromise) uiRootPromise = createUiRoot();
    return uiRootPromise;
  }

  async function createUiRoot() {
    if (document.readyState === 'loading') {
      await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
    const css = await fetch(browser.runtime.getURL('ui/banner.css'))
      .then((res) => res.text())
      .catch(() => '');
    const host = document.createElement('phishshield-ui');
    host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = css;
    shadow.appendChild(style);
    document.documentElement.appendChild(host);
    return shadow;
  }

  /** Pembuat elemen kecil. Teks selalu lewat textContent → aman dari HTML halaman. */
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') el.className = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child instanceof Node ? child : String(child));
    }
    return el;
  }

  // ============================================================
  // 3. BANNER PASIF (skor sedang / tinggi)
  // ============================================================

  async function showBanner(v) {
    const root = await getUiRoot();
    removeBanner(root);
    const danger = v.level === 'danger';
    const reasons = h('ul', { class: 'ps-reasons', hidden: '' }, v.reasons.map((r) => h('li', {}, r)));
    const toggle = h('button', { class: 'ps-link-btn', type: 'button' }, 'Lihat alasan');
    toggle.addEventListener('click', () => {
      reasons.hidden = !reasons.hidden;
      toggle.textContent = reasons.hidden ? 'Lihat alasan' : 'Sembunyikan alasan';
    });

    const banner = h(
      'div',
      { class: `ps-banner ps-${v.level}`, role: 'status' },
      h(
        'div',
        { class: 'ps-banner-head' },
        h('span', { class: 'ps-banner-icon', 'aria-hidden': 'true' }, danger ? '🔴' : '🟡'),
        h(
          'div',
          { class: 'ps-banner-title' },
          h('strong', {}, danger ? 'Halaman ini berisiko tinggi' : 'Waspada'),
          h('span', {}, `Skor risiko ${v.score}% · ${v.hostname}`)
        ),
        h('button', { class: 'ps-icon-btn', type: 'button', 'aria-label': 'Tutup', title: 'Tutup', onclick: () => banner.remove() }, '×')
      ),
      h(
        'p',
        { class: 'ps-banner-hint' },
        danger
          ? 'Jangan isi password atau data pribadi kecuali kamu yakin situs ini asli.'
          : 'Periksa alamat situs sebelum mengisi data.'
      ),
      toggle,
      reasons
    );
    root.appendChild(banner);
  }

  function removeBanner(root) {
    const banner = root && root.querySelector('.ps-banner');
    if (banner) banner.remove();
  }

  // ============================================================
  // 4. TRANSPARENCY ALERT (rancangan bagian 7)
  // ============================================================

  async function renderAlert({ destHost, categories, reasons }) {
    const root = await getUiRoot();
    return new Promise((resolve) => {
      const overlay = h('div', { class: 'ps-overlay' });

      const finish = (decision) => {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        resolve(decision);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish('cancel');
        }
      };

      const cancelBtn = h('button', { class: 'ps-btn ps-btn-primary', type: 'button', onclick: () => finish('cancel') }, 'Batalkan');

      overlay.append(
        h(
          'div',
          { class: 'ps-modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-title' },
          h('div', { class: 'ps-modal-head' }, h('span', { 'aria-hidden': 'true' }, '⚠️'), h('h2', { id: 'ps-title' }, 'Peringatan Keamanan')),
          h(
            'div',
            { class: 'ps-modal-body' },
            h('p', {}, 'Halaman ini (', h('code', {}, location.hostname), ') mencoba mengirim:'),
            h(
              'ul',
              { class: 'ps-sent' },
              categories.map((c) =>
                h('li', {}, h('span', { class: 'ps-cat' }, `${c.icon} ${c.label}`), h('span', { class: 'ps-arrow', 'aria-label': 'ke' }, '→'), h('code', { class: 'ps-dest' }, destHost))
              )
            ),
            h('p', { class: 'ps-section-title' }, 'Alasan peringatan:'),
            h('ul', { class: 'ps-reasons' }, reasons.map((r) => h('li', {}, r))),
            h('p', { class: 'ps-note' }, 'PhishShield tidak membaca, menyimpan, atau mengirim isi data yang kamu ketik.')
          ),
          h(
            'div',
            { class: 'ps-modal-foot' },
            cancelBtn,
            h('button', { class: 'ps-btn ps-btn-secondary', type: 'button', onclick: () => finish('allow') }, 'Tetap lanjut'),
            h('button', { class: 'ps-btn ps-btn-ghost', type: 'button', onclick: () => finish('trust') }, 'Percayai situs ini')
          )
        )
      );

      root.appendChild(overlay);
      document.addEventListener('keydown', onKey, true);
      cancelBtn.focus();
    });
  }

  // ============================================================
  // 5. KEPUTUSAN: BOLEH DIKIRIM ATAU TIDAK?
  // ============================================================

  // Pilihan pengguna per domain tujuan, berlaku sampai halaman ditutup
  const sessionDecisions = new Map();
  // Satu alert dalam satu waktu
  let alertQueue = Promise.resolve();

  function enqueue(task) {
    const run = alertQueue.then(task, task);
    alertQueue = run.catch(() => {});
    return run;
  }

  /** @returns Promise<boolean> true = lanjutkan pengiriman */
  async function decideOutbound({ url, fields, kind }) {
    const v = verdict || (await verdictPromise);
    if (!shouldMonitor(v)) return true;

    const destHost = hostnameOf(url, location.href);
    if (!destHost || isSameSite(destHost) || PS.whitelist.isAnalytics(destHost)) return true;

    const categories = PS.sensitive.detectSensitive(fields);
    if (!categories.some((c) => c.critical)) return true;

    const destDomain = getRegistrableDomain(destHost);
    return enqueue(async () => {
      if (verdict && verdict.trusted) return true;
      if (sessionDecisions.has(destDomain)) return sessionDecisions.get(destDomain) !== 'cancel';

      const reasons = [...new Set([...v.reasons, 'Data dikirim ke domain berbeda dari halaman ini', `Skor risiko: ${v.score}%`])];
      const decision = await renderAlert({ destHost, categories, reasons });

      if (decision === 'trust') {
        await PS.storage.addTrustedSite(location.hostname);
        verdict = { ...v, trusted: true };
        removeBanner(await getUiRoot());
      } else {
        sessionDecisions.set(destDomain, decision);
      }

      PS.storage
        .appendAlertLog({
          page: location.hostname,
          destination: destHost,
          categories: categories.map((c) => c.label),
          decision, // 'cancel' | 'allow' | 'trust'
          score: v.score,
          kind,
        })
        .catch(() => {});

      return decision !== 'cancel';
    });
  }

  // ============================================================
  // 6. SUBMIT FORM HTML BIASA
  // ============================================================

  const bypassForms = new WeakSet();
  const getAttr = Element.prototype.getAttribute;
  const hasAttr = Element.prototype.hasAttribute;

  function formActionUrl(form, submitter) {
    const raw = submitter && hasAttr.call(submitter, 'formaction') ? getAttr.call(submitter, 'formaction') : getAttr.call(form, 'action');
    try {
      const url = new URL(raw || location.href, document.baseURI);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function replaySubmit(form, submitter) {
    bypassForms.add(form);
    try {
      if (submitter && submitter.form === form) HTMLFormElement.prototype.requestSubmit.call(form, submitter);
      else HTMLFormElement.prototype.requestSubmit.call(form);
    } catch {
      HTMLFormElement.prototype.submit.call(form);
    }
    // requestSubmit bisa batal karena validasi; jangan biarkan bypass menggantung
    setTimeout(() => bypassForms.delete(form), 0);
  }

  window.addEventListener(
    'submit',
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (bypassForms.has(form)) {
        bypassForms.delete(form);
        return;
      }
      if (verdict && !shouldMonitor(verdict)) return;

      const submitter = event.submitter || null;
      const action = formActionUrl(form, submitter);
      if (!action || isSameSite(hostnameOf(action))) return;

      const fields = PS.sensitive.collectFormFields(form);
      if (!PS.sensitive.detectSensitive(fields).some((c) => c.critical)) return;

      // Tahan dulu (harus sinkron), lalu tanya pengguna
      event.preventDefault();
      event.stopImmediatePropagation();
      decideOutbound({ url: action, fields, kind: 'form' }).then((allow) => {
        if (allow) replaySubmit(form, submitter);
      });
    },
    true // fase capture: jalan sebelum handler milik halaman
  );

  // ============================================================
  // 7. JEMBATAN DENGAN page-hook.js (fetch / XHR / form.submit() dari JS)
  // ============================================================

  /**
   * Salin data dari halaman menjadi objek biasa. Di Firefox, objek milik halaman
   * dibungkus "Xray wrapper"; salinan JSON membuatnya aman & seragam di semua browser.
   */
  function readPageData(data) {
    try {
      return JSON.parse(JSON.stringify(data));
    } catch {
      return null;
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== HOOK.REQ) return;
    const msg = readPageData(event.data);
    if (!msg || typeof msg.id !== 'string') return;

    window.postMessage({ type: HOOK.ACK, id: msg.id }, '*');
    handleHookRequest(msg)
      .catch(() => true)
      .then((allow) => window.postMessage({ type: HOOK.RES, id: msg.id, allow }, '*'));
  });

  async function handleHookRequest(msg) {
    if (msg.kind === 'form-js') {
      const selector = `form[data-phishshield-submit="${CSS.escape(msg.id)}"]`;
      const form = Document.prototype.querySelector.call(document, selector);
      if (!form) return true;
      return decideOutbound({ url: String(msg.url || ''), fields: PS.sensitive.collectFormFields(form), kind: 'form-js' });
    }
    const fields = Array.isArray(msg.fields)
      ? msg.fields.slice(0, 200).map((f) => ({ name: String(f && f.name ? f.name : ''), value: String(f && f.value != null ? f.value : '') }))
      : [];
    return decideOutbound({ url: String(msg.url || ''), fields, kind: msg.kind === 'xhr' ? 'xhr' : 'fetch' });
  }

  // ============================================================
  // 8. MULAI
  // ============================================================

  function onVerdict(v) {
    if (v && !v.trusted && !v.disabled && v.level !== 'safe') showBanner(v);
  }

  verdictPromise.then(onVerdict);

  // Popup memberi tahu kalau situs baru saja dipercayai / pengaturan berubah
  browser.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== 'VERDICT_UPDATED') return;
    verdictPromise = requestVerdict();
    verdictPromise.then(async (v) => {
      if (uiRootPromise) removeBanner(await getUiRoot());
      onVerdict(v);
    });
  });
})();

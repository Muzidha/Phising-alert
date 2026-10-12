// ============================================================
// ui/popup.js — Popup ekstensi
// ============================================================

(function () {
  'use strict';

  const PS = globalThis.PhishShield;
  const $ = (id) => document.getElementById(id);
  const send = (msg) => browser.runtime.sendMessage(msg);

  const LEVEL_TEXT = { safe: '🟢 Aman', warn: '🟡 Waspada', danger: '🔴 Berbahaya' };
  const DECISION_TEXT = { cancel: 'Dibatalkan', allow: 'Tetap lanjut', trust: 'Dipercayai' };

  let currentTab = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function fillReasons(list, reasons) {
    list.replaceChildren(...(reasons || []).map((r) => el('li', '', r)));
  }

  function levelLabel(v) {
    if (v.disabled) return 'Perlindungan sedang dimatikan';
    if (v.trusted) return '✅ Situs tepercaya';
    if (v.error) return `⚠️ ${v.error}`;
    return LEVEL_TEXT[v.level] || '';
  }

  // ---------- Izin akses situs (terutama Firefox) ----------

  const SITE_ACCESS = { origins: ['http://*/*', 'https://*/*'] };

  async function renderPermission() {
    if (!browser.permissions || !browser.permissions.contains) return;
    const granted = await browser.permissions.contains(SITE_ACCESS).catch(() => true);
    $('perm-card').hidden = granted;
  }

  $('btn-grant').addEventListener('click', async () => {
    // permissions.request harus dipanggil langsung dari klik pengguna
    const granted = await browser.permissions.request(SITE_ACCESS).catch(() => false);
    await renderPermission();
    if (granted) renderCurrent();
  });

  // ---------- Halaman aktif ----------

  async function renderCurrent() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    currentTab = tab || null;
    const fill = $('score-fill');
    const trustBtn = $('btn-trust');
    trustBtn.hidden = true;

    if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
      $('current-host').textContent = 'Bukan halaman web';
      $('score-text').textContent = '–';
      $('level-text').textContent = '';
      fill.style.width = '0';
      fillReasons($('reason-list'), []);
      return;
    }

    const v = await send({ type: 'GET_VERDICT', url: tab.url, tabId: tab.id });
    if (!v || (v.error && !v.thresholds)) {
      $('level-text').textContent = `⚠️ ${(v && v.error) || 'Tidak bisa menilai halaman ini'}`;
      return;
    }

    $('current-host').textContent = v.hostname || new URL(tab.url).hostname;
    $('score-text').textContent = v.trusted || v.disabled ? '–' : `${v.score}%`;
    fill.className = `meter-fill ${v.level}`;
    fill.style.width = v.trusted || v.disabled ? '0' : `${v.score}%`;
    $('level-text').textContent = levelLabel(v) + (v.modelPlaceholder ? ' · model placeholder' : '');
    fillReasons($('reason-list'), v.reasons);
    trustBtn.hidden = !!(v.trusted || v.disabled);
    trustBtn.dataset.hostname = v.hostname || '';
  }

  $('btn-trust').addEventListener('click', async (e) => {
    await PS.storage.addTrustedSite(e.currentTarget.dataset.hostname);
    notifyTab();
    await Promise.all([renderCurrent(), renderTrusted()]);
  });

  function notifyTab() {
    if (currentTab) browser.tabs.sendMessage(currentTab.id, { type: 'VERDICT_UPDATED' }).catch(() => {});
  }

  // ---------- Cek link ----------

  $('check-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = $('check-result');
    const url = $('check-input').value.trim();
    box.hidden = false;
    box.replaceChildren(el('p', 'hint', 'Mengikuti redirect…'));

    const v = await send({ type: 'CHECK_LINK', url }).catch((err) => ({ error: err.message }));
    if (!v || (v.error && !v.thresholds)) {
      box.replaceChildren(el('p', '', `⚠️ Gagal mengecek link: ${(v && v.error) || 'tidak diketahui'}`));
      return;
    }

    const chain = el('div', 'chain');
    chain.append(v.redirected ? 'Tujuan akhir:' : 'Tidak ada redirect.', ' ', el('code', '', v.finalUrl));
    const score = el('p', 'level', `${levelLabel(v)}${v.trusted || v.disabled ? '' : ` · skor ${v.score}%`}`);
    const reasons = el('ul', 'reasons');
    fillReasons(reasons, v.reasons);
    box.replaceChildren(chain, score, reasons);
  });

  // ---------- Riwayat peringatan ----------

  async function renderLog() {
    const log = await PS.storage.getAlertLog();
    $('log-count').textContent = log.length || '';
    const list = $('log-list');
    if (log.length === 0) {
      list.replaceChildren(el('li', 'empty', 'Belum ada peringatan.'));
      return;
    }
    list.replaceChildren(
      ...log.slice(0, 20).map((entry) => {
        const li = el('li');
        const title = el('div');
        title.append(el('code', '', entry.page), ' → ', el('code', '', entry.destination));
        const time = new Date(entry.ts).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
        const meta = el('div', 'meta', `${time} · ${(entry.categories || []).join(', ')} · ${DECISION_TEXT[entry.decision] || entry.decision} · skor ${entry.score}%`);
        li.append(title, meta);
        return li;
      })
    );
  }

  $('btn-clear-log').addEventListener('click', async () => {
    await PS.storage.clearAlertLog();
    renderLog();
  });

  // ---------- Situs tepercaya pengguna ----------

  async function renderTrusted() {
    const sites = await PS.storage.getTrustedSites();
    const list = $('trusted-list');
    if (sites.length === 0) {
      list.replaceChildren(el('li', 'empty', 'Belum ada. Pakai tombol "Percayai situs ini".'));
      return;
    }
    list.replaceChildren(
      ...sites.map((domain) => {
        const li = el('li');
        const remove = el('button', '', '×');
        remove.title = `Hapus ${domain}`;
        remove.setAttribute('aria-label', `Hapus ${domain}`);
        remove.addEventListener('click', async () => {
          await PS.storage.removeTrustedSite(domain);
          notifyTab();
          await Promise.all([renderTrusted(), renderCurrent()]);
        });
        li.append(el('code', '', domain), remove);
        return li;
      })
    );
  }

  // ---------- Pengaturan & info model ----------

  async function renderSettings() {
    const settings = await PS.storage.getSettings();
    $('toggle-enabled').checked = settings.enabled;
    $('toggle-strict').checked = settings.strictMode;

    const info = await send({ type: 'GET_MODEL_INFO' }).catch((err) => ({ ok: false, error: err.message }));
    const box = $('model-info');
    if (!info || !info.ok) {
      box.textContent = `Model gagal dimuat: ${(info && info.error) || 'tidak diketahui'}`;
    } else if (info.placeholder) {
      box.textContent = 'Model: PLACEHOLDER (belum dilatih). Latih model asli lewat ml/train.ipynb.';
    } else {
      const m = info.metadata.metrics || {};
      const pct = (x) => (typeof x === 'number' ? `${(x * 100).toFixed(1)}%` : '–');
      box.textContent =
        `Model: ${info.modelType} (${info.nTrees} pohon, ${info.features.length} fitur, ` +
        `${info.urlScope === 'host' ? 'menilai nama domain' : 'menilai URL penuh'}), dibuat ${info.metadata.created_at || '?'}. ` +
        `Precision ${pct(m.precision)}, recall ${pct(m.recall)}, false positive ${pct(m.false_positive_rate)}.`;
    }
  }

  $('toggle-enabled').addEventListener('change', async (e) => {
    await PS.storage.updateSettings({ enabled: e.target.checked });
    notifyTab();
    renderCurrent();
  });

  $('toggle-strict').addEventListener('change', async (e) => {
    await PS.storage.updateSettings({ strictMode: e.target.checked });
    notifyTab();
  });

  $('btn-selftest').addEventListener('click', () => {
    browser.tabs.create({ url: browser.runtime.getURL('ui/selftest.html') });
  });

  renderPermission();
  renderCurrent();
  renderLog();
  renderTrusted();
  renderSettings();
})();

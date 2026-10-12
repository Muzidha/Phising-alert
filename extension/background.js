// ============================================================
// background.js — Service worker PhishShield
//
// Alur (rancangan bagian 4):
//   whitelist? → rantai redirect → ekstrak fitur → model ML → Risk Score
//   → level (aman / waspada / berbahaya) → dikirim ke content script.
//
// Aturan MV3: jangan simpan state penting di variabel global (service worker
// bisa dimatikan kapan saja); listener didaftarkan sinkron di top-level.
// ============================================================

importScripts(
  'config.js',
  'lib/suffix-list.js',
  'lib/domain.js',
  'lib/storage.js',
  'whitelist.js',
  'features.js',
  'model/ml-engine.js',
  'risk.js',
  'cache.js',
  'unshortener.js'
);

const PS = globalThis.PhishShield;

PS.redirects.install();

// ============================================================
// ANALISIS URL
// ============================================================

/** MVP: umur domain di-mock (config.mockDomainAgeDays). null = tidak diketahui. */
function getDomainAgeDays(hostname) {
  const age = PS.config.mockDomainAgeDays[PS.domain.getRegistrableDomain(hostname)];
  return typeof age === 'number' ? age : null;
}

async function analyzeUrl(url, { redirectChain = [url] } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { url, level: 'safe', score: 0, skipped: true, reasons: ['URL tidak valid'] };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { url, level: 'safe', score: 0, skipped: true, reasons: ['Bukan halaman web'] };
  }

  const settings = await PS.storage.getSettings();
  const base = {
    url,
    hostname: parsed.hostname,
    domain: PS.domain.getRegistrableDomain(parsed.hostname),
    strictMode: settings.strictMode,
    thresholds: { ...PS.config.thresholds },
    redirectChain,
    score: 0,
    level: 'safe',
    reasons: [],
  };

  if (!settings.enabled) return { ...base, disabled: true };

  const trustedSites = await PS.storage.getTrustedSites();
  if (PS.whitelist.isTrusted(parsed.hostname, trustedSites)) {
    return { ...base, trusted: true, reasons: ['Domain ada di daftar situs tepercaya'] };
  }

  let model;
  try {
    model = await PS.ml.loadModel();
  } catch (err) {
    console.error('[PhishShield]', err);
    return { ...base, error: `Model ML gagal dimuat: ${err.message}` };
  }
  const thresholds = { ...PS.config.thresholds, ...(model.thresholds || {}) };

  let cached = await PS.cache.get(url);
  if (!cached || cached.modelId !== model.model_id) {
    const features = PS.features.extractFeatures(url, model.url_scope);
    cached = { modelId: model.model_id, features, modelProba: PS.ml.predictProba(model, features) };
    await PS.cache.set(url, cached);
  }

  const verdict = PS.risk.buildVerdict({
    features: cached.features,
    urlScope: model.url_scope,
    modelProba: cached.modelProba,
    redirectChain,
    domainAgeDays: getDomainAgeDays(parsed.hostname),
    thresholds,
    adjustments: PS.config.adjustments,
    shortenerHosts: PS.config.shortenerHosts,
  });

  return { ...base, ...verdict, thresholds, features: cached.features, modelPlaceholder: !!model.placeholder };
}

// ============================================================
// BADGE IKON
// ============================================================

const BADGE = {
  warn: { text: '!', color: '#d69e2e' },
  danger: { text: '!!', color: '#e53e3e' },
};

function setBadge(tabId, verdict) {
  const level = verdict && !verdict.trusted && !verdict.disabled ? verdict.level : 'safe';
  const style = BADGE[level];
  chrome.action.setBadgeText({ tabId, text: style ? style.text : '' }).catch(() => {});
  if (style) chrome.action.setBadgeBackgroundColor({ tabId, color: style.color }).catch(() => {});
}

// ============================================================
// PESAN DARI CONTENT SCRIPT & POPUP
// ============================================================

const HANDLERS = {
  // { url } dari content script, atau { url, tabId } dari popup
  async GET_VERDICT(msg, sender) {
    const tabId = sender.tab ? sender.tab.id : msg.tabId;
    const redirectChain = typeof tabId === 'number' ? await PS.redirects.getChain(tabId, msg.url) : [msg.url];
    const verdict = await analyzeUrl(msg.url, { redirectChain });
    if (sender.tab && sender.frameId === 0) setBadge(tabId, verdict);
    return verdict;
  },

  // Tombol "Cek link" di popup: ikuti redirect dulu, lalu nilai URL akhirnya
  async CHECK_LINK(msg) {
    const { finalUrl, redirected } = await PS.redirects.resolve(msg.url);
    const verdict = await analyzeUrl(finalUrl, { redirectChain: redirected ? [msg.url, finalUrl] : [finalUrl] });
    return { ...verdict, originalUrl: msg.url, finalUrl, redirected };
  },

  async GET_MODEL_INFO() {
    try {
      const model = await PS.ml.loadModel();
      return {
        ok: true,
        placeholder: !!model.placeholder,
        modelId: model.model_id,
        modelType: model.model_type,
        urlScope: model.url_scope,
        features: model.features,
        nTrees: model.trees.length,
        metadata: model.metadata || {},
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = HANDLERS[msg && msg.type];
  if (!handler) return false;
  Promise.resolve()
    .then(() => handler(msg, sender))
    .then(sendResponse, (err) => {
      console.error(`[PhishShield] ${msg.type} gagal:`, err);
      sendResponse({ error: String((err && err.message) || err) });
    });
  return true; // sendResponse dipanggil asinkron
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) setBadge(details.tabId, null);
});

chrome.runtime.onInstalled.addListener(async () => {
  await PS.cache.clear(); // model/fitur bisa berubah setelah update → buang skor lama
  await PS.storage.updateSettings({}); // tulis pengaturan default
});

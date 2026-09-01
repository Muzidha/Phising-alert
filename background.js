// ============================================================
// background.js — PhishShield Phase 1 (Updated)
// Service Worker: tetap handle blacklist URL + terima log event
// dari content script.
// Rule: jangan simpan state di variable global (SW bisa mati kapan saja)!
// ============================================================

// Blacklist domain (sementara, akan diganti ML di Phase 2+)
const BLACKLISTED_DOMAINS = [
  'contoh-phishing-bca.com',
  'login-fake-bank.net',
  'paypa1.com',
  'free-crypto-giveaway.xyz',
  'testing-phishing-url.com',
];

// ============================================================
// LISTENER 1: Cegat navigasi ke URL phishing (blacklist)
// ============================================================
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Hanya proses frame utama (tab aktif), abaikan iframe/ads
  if (details.frameId !== 0) return;

  try {
    const parsedUrl = new URL(details.url);
    const hostname = parsedUrl.hostname.toLowerCase();

    // Lewatkan skema non-web atau halaman internal ekstensi
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return;

    // Periksa apakah domain ada di session whitelist (bypass dari user)
    const sessionData = await chrome.storage.session.get(hostname);
    if (sessionData[hostname]) return;

    // Cek blacklist
    const isPhishing = BLACKLISTED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (isPhishing) {
      const warningPageUrl =
        chrome.runtime.getURL('blocked.html') +
        `?url=${encodeURIComponent(details.url)}`;
      await chrome.tabs.update(details.tabId, { url: warningPageUrl });
    }
  } catch (error) {
    console.error('[PhishShield] Error saat memeriksa URL:', error);
  }
});

// ============================================================
// LISTENER 2: Terima pesan dari content script
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Jalankan async di dalam IIFE agar bisa pakai await
  (async () => {
    switch (message.type) {

      // --- Log event dari transparency alert (blokir/izinkan) ---
      case 'LOG_EVENT': {
        const { payload } = message;
        try {
          const stored = await chrome.storage.local.get('activity_log');
          const log = stored.activity_log || [];

          // Tambah entry baru, batasi 200 entri terakhir
          log.unshift({
            id: Date.now(),
            timestamp: payload.timestamp,
            pageUrl: payload.pageUrl,
            destination: payload.destination,
            fields: payload.fields,
            action: payload.type, // 'BLOCKED' | 'ALLOWED'
          });

          if (log.length > 200) log.splice(200);

          await chrome.storage.local.set({ activity_log: log });

          // Update badge counter untuk notifikasi visual
          await updateBadgeCount();
        } catch (err) {
          console.error('[PhishShield] Gagal menyimpan log:', err);
        }
        sendResponse({ ok: true });
        break;
      }

      default:
        sendResponse({ ok: false, error: 'Unknown message type' });
    }
  })();

  return true; // Penting: keep message channel open untuk async sendResponse
});

// ============================================================
// UTILITAS
// ============================================================

/**
 * Update badge di icon ekstensi: tampilkan jumlah alert hari ini.
 */
async function updateBadgeCount() {
  try {
    const stored = await chrome.storage.local.get('activity_log');
    const log = stored.activity_log || [];

    // Hitung alert hari ini
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayCount = log.filter((entry) => entry.timestamp >= todayStart).length;

    if (todayCount > 0) {
      await chrome.action.setBadgeText({ text: String(todayCount) });
      await chrome.action.setBadgeBackgroundColor({ color: '#e53e3e' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch (err) {
    console.error('[PhishShield] Gagal update badge:', err);
  }
}

// Reset badge setiap hari pada midnight
chrome.alarms.create('daily-badge-reset', { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'daily-badge-reset') {
    await updateBadgeCount();
  }
});

console.debug('[PhishShield] Background service worker aktif.');

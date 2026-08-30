// Daftar domain simulasi/contoh yang diblokir (Blacklist sederhana)
const BLACKLISTED_DOMAINS = [
  'contoh-phishing-bca.com',
  'login-fake-bank.net',
  'paypa1.com',
  'free-crypto-giveaway.xyz',
  'testing-phishing-url.com'
];

// Mencegat navigasi sebelum browser memuat konten web
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Hanya proses frame utama (tab aktif), abaikan iframe/ads
  if (details.frameId !== 0) return;

  try {
    const parsedUrl = new URL(details.url);
    const hostname = parsedUrl.hostname.toLowerCase();

    // Lewatkan skema non-web atau halaman internal ekstensi
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return;
    if (parsedUrl.protocol === 'chrome-extension:') return;

    // Periksa apakah domain ada di whitelist sementara (bypass dari user)
    const sessionData = await chrome.storage.session.get(hostname);
    if (sessionData[hostname]) return;

    // Cek apakah domain masuk ke daftar hitam (Blacklist)
    const isPhishing = BLACKLISTED_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (isPhishing) {
      // Siapkan URL halaman peringatan lokal
      const warningPageUrl = chrome.runtime.getURL('blocked.html') + 
                             `?url=${encodeURIComponent(details.url)}`;

      // Alihkan tab pengguna ke halaman peringatan
      chrome.tabs.update(details.tabId, { url: warningPageUrl });
    }
  } catch (error) {
    console.error('Error saat memeriksa URL:', error);
  }
});

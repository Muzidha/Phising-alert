// ============================================================
// whitelist.js — Daftar domain tepercaya & pengecualian
// Pencocokan selalu berbasis akhiran domain (lihat lib/domain.js),
// jadi "integra.its.ac.id" ikut tepercaya kalau "its.ac.id" ada di daftar.
// Periksa ulang daftar ini sebelum demo.
// ============================================================

(function (PS) {
  'use strict';

  const { hostMatchesDomain } = PS.domain;

  // ±100 domain populer + kampus. Tambahkan domain kampus/instansimu di sini.
  const TRUSTED_DOMAINS = [
    // Kampus
    'its.ac.id', 'ui.ac.id', 'ugm.ac.id', 'itb.ac.id', 'ipb.ac.id', 'unair.ac.id',
    'undip.ac.id', 'unpad.ac.id', 'ub.ac.id', 'uny.ac.id', 'uns.ac.id', 'unhas.ac.id',
    'telkomuniversity.ac.id', 'binus.ac.id', 'upnjatim.ac.id', 'unesa.ac.id',
    // Pemerintah & layanan publik
    'kemdikbud.go.id', 'kemenkeu.go.id', 'pajak.go.id', 'bpjs-kesehatan.go.id',
    'bpjsketenagakerjaan.go.id', 'dukcapil.kemendagri.go.id', 'kemkes.go.id',
    // Bank & pembayaran
    'bca.co.id', 'klikbca.com', 'bri.co.id', 'bankmandiri.co.id', 'bni.co.id',
    'btn.co.id', 'cimbniaga.co.id', 'danamon.co.id', 'permatabank.com', 'jenius.com',
    'ocbc.id', 'dana.id', 'ovo.id', 'linkaja.id', 'paypal.com',
    // E-commerce & transportasi
    'tokopedia.com', 'shopee.co.id', 'bukalapak.com', 'lazada.co.id', 'blibli.com',
    'traveloka.com', 'tiket.com', 'gojek.com', 'grab.com', 'amazon.com',
    // Berita
    'kompas.com', 'detik.com', 'tribunnews.com', 'cnnindonesia.com', 'liputan6.com',
    'tempo.co', 'antaranews.com', 'kumparan.com',
    // Teknologi & produktivitas
    'google.com', 'google.co.id', 'youtube.com', 'gmail.com', 'microsoft.com',
    'microsoftonline.com', 'office.com', 'live.com', 'outlook.com', 'apple.com',
    'icloud.com', 'github.com', 'gitlab.com', 'stackoverflow.com', 'wikipedia.org',
    'zoom.us', 'notion.so', 'canva.com', 'figma.com', 'dropbox.com', 'cloudflare.com',
    'anthropic.com', 'claude.ai', 'openai.com', 'yahoo.com', 'bing.com', 'duckduckgo.com',
    // Media sosial & hiburan
    'facebook.com', 'instagram.com', 'whatsapp.com', 'x.com', 'twitter.com',
    'linkedin.com', 'tiktok.com', 'telegram.org', 'discord.com', 'reddit.com',
    'medium.com', 'netflix.com', 'spotify.com',
  ];

  // Subdomain berisi konten buatan pengguna di domain tepercaya. Phisher sering
  // menumpang di sini (mis. form login palsu di Google Sites/Forms), jadi
  // tidak pernah otomatis dianggap tepercaya.
  const NEVER_TRUST_HOSTS = [
    'sites.google.com', 'docs.google.com', 'drive.google.com', 'script.google.com',
    'storage.googleapis.com', 'firebasestorage.googleapis.com',
    'forms.office.com', 'onedrive.live.com',
  ];

  // Tujuan analitik & iklan pihak ketiga: tidak memicu peringatan lintas-domain.
  const ANALYTICS_DOMAINS = [
    'google-analytics.com', 'analytics.google.com', 'googletagmanager.com',
    'doubleclick.net', 'googlesyndication.com', 'facebook.net', 'hotjar.com', 'hotjar.io',
    'clarity.ms', 'segment.io', 'segment.com', 'mixpanel.com', 'amplitude.com',
    'sentry.io', 'nr-data.net', 'newrelic.com', 'datadoghq.com', 'cloudflareinsights.com',
    'plausible.io',
    // Iklan (persetujuan cookie & lelang iklan)
    'fundingchoicesmessages.google.com', 'rubiconproject.com', 'adnxs.com', 'pubmatic.com',
    'openx.net', 'criteo.com', 'criteo.net', 'casalemedia.com', 'adsrvr.org',
    'amazon-adsystem.com', 'taboola.com', 'outbrain.com',
  ];

  const matchesAny = (host, list) => list.some((domain) => hostMatchesDomain(host, domain));

  /** Tepercaya = ada di daftar bawaan atau daftar pengguna, dan bukan host konten pengguna. */
  function isTrusted(host, userTrustedSites = []) {
    if (matchesAny(host, NEVER_TRUST_HOSTS)) return false;
    return matchesAny(host, TRUSTED_DOMAINS) || matchesAny(host, userTrustedSites);
  }

  function isAnalytics(host) {
    return matchesAny(host, ANALYTICS_DOMAINS);
  }

  PS.whitelist = { TRUSTED_DOMAINS, NEVER_TRUST_HOSTS, ANALYTICS_DOMAINS, isTrusted, isAnalytics };
})(globalThis.PhishShield = globalThis.PhishShield || {});

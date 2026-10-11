// ============================================================
// risk.js — Dari fitur + peluang model menjadi Risk Score, level, dan
// alasan berbahasa sederhana (rancangan bagian 7).
// ============================================================

(function (PS) {
  'use strict';

  const { hostMatchesDomain, hostnameOf } = PS.domain;

  // Alasan yang ditampilkan ke pengguna. Fitur yang tidak dipakai model tetap
  // boleh jadi alasan, karena semuanya dihitung oleh features.js.
  const REASON_RULES = [
    { when: (f) => f.HasIP === 1, text: () => 'Alamat situs berupa angka IP, bukan nama domain' },
    { when: (f) => f.HasAtSymbol === 1, text: () => 'Ada simbol "@" di alamat, trik untuk menyembunyikan domain asli' },
    { when: (f) => f.HasPunycode === 1, text: () => 'Nama domain memakai huruf "mirip" (punycode) yang bisa meniru situs lain' },
    { when: (f) => f.SubdomainCount >= 3, text: (f) => `Terlalu banyak subdomain (${f.SubdomainCount}), sering dipakai untuk menyamar` },
    { when: (f) => f.NumHyphens >= 3, text: (f) => `Banyak tanda hubung "-" di alamat (${f.NumHyphens})` },
    { when: (f) => f.NumDots >= 5, text: (f) => `Banyak titik di alamat (${f.NumDots})` },
    { when: (f) => f.URLLength >= 100, text: (f) => `Alamat sangat panjang (${f.URLLength} karakter), bisa untuk menyembunyikan tujuan` },
    { when: (f) => f.IsHTTPS === 0, text: () => 'Koneksi tidak terenkripsi (bukan HTTPS)' },
  ];

  function explainFeatures(features) {
    return REASON_RULES.filter((rule) => rule.when(features)).map((rule) => rule.text(features));
  }

  function levelFor(score, thresholds) {
    if (score >= thresholds.danger) return 'danger';
    if (score >= thresholds.warn) return 'warn';
    return 'safe';
  }

  /**
   * Skor akhir = skor model + penyesuaian heuristik (redirect, link pendek,
   * umur domain). Setiap penyesuaian selalu muncul di daftar alasan.
   */
  function buildVerdict({ features, modelProba, redirectChain = [], domainAgeDays = null, thresholds, adjustments, shortenerHosts }) {
    const modelScore = Math.round(modelProba * 100);
    const reasons = explainFeatures(features);
    let bonus = 0;

    const redirectHops = Math.max(0, redirectChain.length - 1);
    if (redirectHops >= adjustments.minRedirects) {
      bonus += adjustments.redirectPoints;
      reasons.push(`Kamu dialihkan ${redirectHops} kali sebelum sampai di halaman ini`);
    }

    const firstHost = redirectHops > 0 ? hostnameOf(redirectChain[0]) : '';
    const viaShortener = !!firstHost && shortenerHosts.some((d) => hostMatchesDomain(firstHost, d));
    if (viaShortener) {
      bonus += adjustments.shortenerPoints;
      reasons.push(`Dibuka lewat link pendek (${firstHost}) yang menyembunyikan tujuan asli`);
    }

    if (typeof domainAgeDays === 'number' && domainAgeDays < adjustments.youngDomainDays) {
      bonus += adjustments.youngDomainPoints;
      reasons.push(`Domain baru dibuat (${domainAgeDays} hari yang lalu)`);
    }

    const score = Math.min(100, modelScore + bonus);
    const level = levelFor(score, thresholds);
    if (level !== 'safe') {
      if (reasons.length === 0) reasons.push('Pola alamatnya mirip situs phishing menurut model ML');
      reasons.push('Domain tidak ada di daftar situs tepercaya');
    }

    return { score, modelScore, bonus, level, reasons, redirectHops, viaShortener };
  }

  PS.risk = { explainFeatures, levelFor, buildVerdict };
})(globalThis.PhishShield = globalThis.PhishShield || {});

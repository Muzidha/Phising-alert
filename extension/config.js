// ============================================================
// config.js — Semua angka & daftar yang bisa disetel ada di sini
// ============================================================

(function (PS) {
  'use strict';

  PS.config = {
    // Ambang skor risiko (0–100). Ini titik awal dari rancangan (bagian 7);
    // setel ulang berdasarkan hasil uji (lihat analisis ambang di ml/train.ipynb).
    // Kalau model/model.json punya "thresholds", nilai dari model yang dipakai.
    // monitor: mulai memantau form/request (tanpa banner). warn/danger: banner kuning/merah.
    // Dipisah supaya Transparency Alert tetap menjangkau lebih banyak phishing, sementara
    // banner hanya muncul di skor yang lebih yakin (lebih sedikit false positive).
    thresholds: { monitor: 45, warn: 55, danger: 75 },

    defaultSettings: {
      enabled: true,
      // true = pantau form di semua situs yang belum tepercaya, apa pun skornya
      strictMode: false,
      // true = mode uji: catat setiap situs yang dibuka + skor & banner (unduh CSV di popup)
      logVisits: false,
    },

    // Cache skor per halaman supaya tidak dihitung ulang terus
    cache: { ttlMs: 24 * 60 * 60 * 1000, maxEntries: 500 },

    // Penyesuaian heuristik DI LUAR model ML. Datanya (redirect, umur domain)
    // tidak ada di dataset training, jadi ditambahkan sebagai poin terpisah
    // dan selalu tercatat di daftar alasan supaya tetap transparan.
    adjustments: {
      minRedirects: 2,       // dialihkan ≥ 2 kali …
      redirectPoints: 10,    // … tambah 10 poin
      shortenerPoints: 5,    // dibuka lewat link pendek
      youngDomainDays: 30,   // domain berumur < 30 hari …
      youngDomainPoints: 15, // … tambah 15 poin
    },

    // Layanan pemendek link. "pendek.test" = link pendek tiruan di demo/server.py
    shortenerHosts: [
      'bit.ly', 'bit.do', 'buff.ly', 'cutt.ly', 'goo.gl', 'is.gd', 'lnkd.in', 'ow.ly',
      'rb.gy', 'rebrand.ly', 's.id', 'shope.ee', 'shorturl.at', 't.co', 't.ly',
      'tiny.cc', 'tinyurl.com',
      'pendek.test',
    ],

    // MVP: umur domain (WHOIS/RDAP) di-mock untuk domain demo saja.
    // Kunci = domain inti, nilai = umur dalam hari.
    // Pengembangan lanjut: ambil dari RDAP (https://rdap.org/domain/<domain>) + cache.
    mockDomainAgeDays: {
      'free-host.test': 2,
      'ngrok-free.test': 1,
    },

    alertLogMax: 200,
    visitLogMax: 1000,
  };
})(globalThis.PhishShield = globalThis.PhishShield || {});

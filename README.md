# 🛡️ PhishShield: Ekstensi Anti-Phishing Zero-Day dengan Transparansi Data

Ekstensi browser (Chrome/Edge, Manifest V3) yang melindungi dari **phishing yang belum dikenal (zero-day)** tanpa bergantung pada blacklist:

> *Ekstensi yang tidak cuma bilang "halaman ini bahaya", tapi menunjukkan **kenapa** dan **data apa** yang sedang dicuri, tanpa mengirim riwayat browsing kamu ke mana-mana.*

Rancangan lengkap: [proyek-ekstensi-anti-phishing.md](proyek-ekstensi-anti-phishing.md).

## 3 Pilar

| Pilar | Isi | File utama |
|---|---|---|
| **1. URL & tujuan akhir** | Lacak rantai redirect (link pendek), ekstrak fitur URL | `extension/unshortener.js`, `extension/features.js` |
| **2. Request monitor** | Deteksi password/OTP/kartu/NIK yang dikirim ke domain lain lewat form, `fetch`, XHR | `extension/content.js`, `extension/page-hook.js`, `extension/sensitive.js` |
| **3. ML lokal + alert transparan** | Model pohon keputusan jalan di browser → Risk Score 0–100% → banner / Transparency Alert | `extension/model/`, `extension/risk.js`, `extension/ui/` |

## Struktur folder

```
.
├── extension/                 # ← folder ini yang di-"Load unpacked"
│   ├── manifest.json          # konfigurasi MV3
│   ├── background.js          # service worker: whitelist → redirect → fitur → ML → skor
│   ├── content.js             # banner pasif, pantau submit form, Transparency Alert
│   ├── page-hook.js           # (MAIN world) bungkus fetch / XHR / form.submit() milik halaman
│   ├── sensitive.js           # kenali jenis data sensitif (tanpa menyimpan isinya)
│   ├── features.js            # ekstraksi fitur URL (kembaran ml/features.py)
│   ├── risk.js                # skor model + heuristik → level & alasan
│   ├── unshortener.js         # rantai redirect & "Cek link"
│   ├── whitelist.js           # domain tepercaya, pengecualian, analitik
│   ├── cache.js               # cache skor per halaman (24 jam)
│   ├── config.js              # ambang skor, poin heuristik, daftar link pendek, mock umur domain
│   ├── lib/                   # domain.js, suffix-list.js, storage.js
│   ├── model/
│   │   ├── model.json         # model hasil ekspor (sekarang: PLACEHOLDER)
│   │   └── ml-engine.js       # evaluasi pohon di browser
│   ├── ui/
│   │   ├── banner.css         # gaya banner & alert (di dalam Shadow DOM)
│   │   ├── popup.html/.js/.css
│   │   └── selftest.html/.js  # uji kecocokan Python vs JavaScript
│   └── icons/
├── ml/                        # pelatihan model (lihat ml/README.md)
│   ├── train.ipynb
│   ├── features.py
│   ├── prepare_data.py
│   ├── export_model.py
│   └── data/
├── demo/                      # demo lokal (lihat demo/README.md)
│   ├── server.py
│   └── fake-login/
└── docs/arsip/                # catatan lama
```

## Cara pasang ekstensi

1. Buka `chrome://extensions` (Edge: `edge://extensions`).
2. Aktifkan **Developer mode**.
3. **Load unpacked** → pilih folder **`extension/`** (bukan root repo).
4. Butuh Chrome/Edge ≥ 111 (untuk content script `world: "MAIN"`).

Sebelum model asli dilatih, ekstensi memakai **model placeholder** (pohon kecil tulisan tangan) supaya tetap bisa dicoba. Popup akan menampilkan tulisan "model placeholder".

## Alur kerja

```
buka halaman
  └─ domain di whitelist? ──ya──▶ diam
        │ tidak
        ▼
  rantai redirect (webRequest, baca saja) → fitur URL → model ML → skor model
        + heuristik (dialihkan ≥2×, link pendek, domain baru) → Risk Score
        │
        ├─ < 40%  🟢 Aman       → diam
        ├─ ≥ 40%  🟡 Waspada    → banner kecil di pojok, form/request mulai dipantau
        └─ ≥ 70%  🔴 Berbahaya  → banner merah, form/request dipantau
                      │
                      ▼
        password / OTP / kartu / NIK dikirim ke domain lain?
                      └─ya──▶ Transparency Alert: [Batalkan] [Tetap lanjut] [Percayai situs ini]
```

Ambang ada di `extension/config.js` dan bisa di-override dari `model.json` hasil training.

## Melatih model

Lihat **[ml/README.md](ml/README.md)**. Ringkasnya:

```bash
cd ml
pip install -r requirements.txt
jupyter lab train.ipynb      # jalankan semua sel: unduh PhiUSIIL dari UCI → latih → tulis extension/model/model.json
```

Lalu reload ekstensi dan buka popup → **Pengaturan & model** → **Uji kecocokan model**.

## Demo

Lihat **[demo/README.md](demo/README.md)**:

```bash
python3 demo/server.py
# buka http://localhost:8000/ lalu klik link pendeknya
```

## Pembagian tugas (rancangan bagian 11)

| Peran | File |
|---|---|
| ML Engineer | `ml/*`, `extension/features.js` (jaga kontrak fitur), `extension/model/` |
| Extension Dev (Core) | `extension/manifest.json`, `background.js`, `unshortener.js`, `risk.js`, `cache.js`, `config.js` |
| Extension Dev (UI/Monitor) | `extension/content.js`, `page-hook.js`, `sensitive.js`, `ui/*`, `whitelist.js` |
| Demo & Pitch | `demo/*`, README, slide, video |

## Privasi

- Semua analisis berjalan **di dalam browser**; tidak ada server/backend.
- Yang disimpan di `chrome.storage.local`: pengaturan, daftar situs tepercaya, cache skor per halaman (24 jam), dan riwayat peringatan berisi **jenis data + nama domain saja** (tidak pernah isi yang diketik).
- Satu-satunya request jaringan dari ekstensi: tombol **Cek link** di popup (mengikuti redirect link yang kamu tempel).
- Izin: `storage`, `webNavigation`, `webRequest` (hanya membaca, tidak memblokir), akses ke halaman `http/https`.

## Keterbatasan & future work

- Halaman yang sangat canggih bisa melewati pemantauan (iframe, `navigator.sendBeacon`, WebSocket). Ini keterbatasan cara A di rancangan 5.3; cara B (`chrome.webRequest`) bisa jadi lapisan tambahan.
- Umur domain masih mock (`config.js`); berikutnya bisa pakai RDAP + cache.
- Model hanya menilai URL. Analisis konten/visual halaman, dukungan Firefox, sinkronisasi pengaturan, dan dashboard statistik masuk future work.
- Akurasi model bergantung dataset; uji juga dengan URL di luar dataset (ada di notebook).

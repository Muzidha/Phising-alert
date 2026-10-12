# 🛡️ PhishShield: Ekstensi Anti-Phishing Zero-Day dengan Transparansi Data

Ekstensi browser (Manifest V3, satu kode untuk Chrome, Edge, Brave, Opera, Firefox, dan Safari) yang melindungi dari **phishing yang belum dikenal (zero-day)** tanpa bergantung pada blacklist:

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
│   ├── lib/                   # compat.js (lintas browser), domain.js, suffix-list.js, storage.js
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

Folder **`extension/`** yang sama dipakai di semua browser, tanpa langkah build.

| Browser | Versi minimum | Status |
|---|---|---|
| Chrome, Edge, Brave, Opera, Vivaldi (berbasis Chromium) | Chrome 121 | Didukung penuh |
| Firefox (desktop) | 128 | Didukung penuh |
| Firefox Android | 128 | Seharusnya jalan, belum diuji |
| Safari (macOS/iOS) | 18 | Perlu konversi Xcode, belum diuji |

### Chrome / Edge / Brave / Opera / Vivaldi

1. Buka halaman ekstensi: `chrome://extensions`, `edge://extensions`, `brave://extensions`, `opera://extensions`, atau `vivaldi:extensions`.
2. Aktifkan **Developer mode**.
3. **Load unpacked** → pilih folder **`extension/`** (bukan root repo).

Chrome akan menampilkan peringatan *"Unrecognized manifest key 'browser_specific_settings'"*. Itu normal: kunci tersebut khusus untuk Firefox/Safari dan diabaikan Chrome.

### Firefox

1. Buka `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on…** → pilih file **`extension/manifest.json`**.
3. Kalau popup PhishShield menampilkan "belum punya izin membaca situs", klik **Beri izin akses situs**.

Add-on sementara hilang saat Firefox ditutup. Supaya terpasang permanen, add-on harus ditandatangani Mozilla (unggah ke [addons.mozilla.org](https://addons.mozilla.org/developers/) sebagai *unlisted*, atau pakai `web-ext sign`). Alternatifnya, pakai Firefox Developer Edition/Nightly dengan `xpinstall.signatures.required = false`.

Opsional, untuk menguji dengan [web-ext](https://github.com/mozilla/web-ext):
```bash
npx web-ext lint --source-dir extension   # cek manifest & kode
npx web-ext run  --source-dir extension   # buka Firefox baru dengan ekstensi terpasang
```

### Safari (macOS, butuh Xcode)

```bash
xcrun safari-web-extension-converter extension/ --app-name PhishShield
```
Buka proyek Xcode yang dihasilkan, jalankan, lalu aktifkan ekstensinya di Safari → Settings → Extensions. Ini belum kami uji. Kalau `webRequest` tidak tersedia, pelacakan redirect otomatis nonaktif, tapi fitur lain tetap jalan.

### Cara kerja lintas browser

- `lib/compat.js` menyamakan namespace: semua kode memakai `browser.*`. Di Chrome, `browser` = `chrome`.
- `manifest.json` berisi `background.service_worker` (dipakai Chrome) **dan** `background.scripts` (dipakai Firefox/Safari). `background.js` hanya memanggil `importScripts` kalau berjalan sebagai service worker.
- Daftar file di `background.scripts` (manifest) dan `importScripts` (background.js) harus sama dan berurutan sama.

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

Model dilatih dalam mode **berbasis host** (`url_scope: "host"`): yang dinilai hanya `skema://host/` dengan `www.` dibuang. Alasannya, di dataset PhiUSIIL semua URL legit tidak punya path, sehingga model URL penuh belajar "punya path = phishing". Detailnya ada di [ml/README.md](ml/README.md#cakupan-url-url_scope).

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

- Halaman yang sangat canggih bisa melewati pemantauan (iframe, `navigator.sendBeacon`, WebSocket). Ini keterbatasan cara A di rancangan 5.3; cara B (`webRequest`) bisa jadi lapisan tambahan.
- Umur domain masih mock (`config.js`); berikutnya bisa pakai RDAP + cache.
- Model hanya menilai URL. Analisis konten/visual halaman, sinkronisasi pengaturan, dan dashboard statistik masuk future work.
- Safari & Firefox Android belum diuji langsung.
- Akurasi model bergantung dataset; uji juga dengan URL di luar dataset (ada di notebook).

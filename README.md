# PhishShield

**Ekstensi browser anti-phishing zero-day dengan machine learning lokal dan transparansi data.**

PhishShield mendeteksi halaman phishing yang belum tercatat di daftar hitam mana pun (zero-day) dengan menilai pola alamat situs menggunakan model machine learning yang berjalan langsung di browser. Ketika sebuah halaman berusaha mengirim data sensitif, seperti password, OTP, nomor kartu, atau NIK, ke domain lain, PhishShield menampilkan peringatan yang menjelaskan **data apa** yang akan dikirim, **ke mana**, dan **mengapa** halaman tersebut dicurigai.

Seluruh analisis dilakukan di perangkat pengguna. Tidak ada server, dan riwayat browsing tidak pernah dikirim ke pihak mana pun.

Dokumen rancangan lengkap: [proyek-ekstensi-anti-phishing.md](proyek-ekstensi-anti-phishing.md)

---

## Daftar Isi

1. [Fitur Utama](#fitur-utama)
2. [Cara Kerja](#cara-kerja)
3. [Model Machine Learning](#model-machine-learning)
4. [Instalasi](#instalasi)
5. [Penggunaan](#penggunaan)
6. [Melatih Ulang Model](#melatih-ulang-model)
7. [Demo](#demo)
8. [Struktur Repositori](#struktur-repositori)
9. [Privasi dan Izin](#privasi-dan-izin)
10. [Keterbatasan dan Pengembangan Lanjutan](#keterbatasan-dan-pengembangan-lanjutan)
11. [Pembagian Peran](#pembagian-peran)

---

## Fitur Utama

PhishShield dibangun di atas tiga pilar:

| Pilar | Fungsi | Komponen utama |
|---|---|---|
| **1. Analisis URL dan tujuan akhir** | Melacak rantai redirect (termasuk link pendek) dan mengekstrak fitur dari alamat halaman tujuan. | `unshortener.js`, `features.js` |
| **2. Pemantauan pengiriman data** | Mengenali password, OTP, nomor kartu, dan NIK yang dikirim ke domain lain melalui form, `fetch`, atau XHR, tanpa menyimpan isinya. | `content.js`, `page-hook.js`, `sensitive.js` |
| **3. Model ML lokal dan Transparency Alert** | Model Random Forest dijalankan di browser untuk menghasilkan Risk Score 0–100, yang kemudian menentukan banner peringatan dan pemantauan form. | `model/`, `risk.js`, `ui/` |

Fitur pendukung:

- **Daftar situs tepercaya** berisi sekitar 100 domain populer (kampus, instansi pemerintah, bank, e-commerce, layanan umum). Subdomain berisi konten buatan pengguna, seperti `sites.google.com` dan `docs.google.com`, tidak pernah otomatis dianggap tepercaya.
- **Cek link** untuk memeriksa tujuan akhir sebuah link pendek sebelum dibuka.
- **Mode ketat** untuk memantau form di semua situs yang belum tepercaya, berapa pun skornya.
- **Mode uji** untuk mencatat skor setiap halaman dan mengunduhnya sebagai CSV saat evaluasi.

---

## Cara Kerja

```
Halaman dibuka
  |
  +-- Domain ada di daftar tepercaya? --- ya ---> tidak ada tindakan
  |
  v
Rantai redirect -> fitur URL -> model ML (di browser) -> skor model
  + penyesuaian heuristik (redirect, link pendek, umur domain) = Risk Score
  |
  +-- skor < 45      tidak ada tindakan
  +-- skor 45 - 54   form dan request dipantau, tanpa banner
  +-- skor 55 - 74   banner kuning "Waspada" + pemantauan
  +-- skor >= 75     banner merah "Berbahaya" + pemantauan
                |
                v
  Password / OTP / kartu / NIK dikirim ke domain lain?
                +-- ya ---> Transparency Alert: [Batalkan] [Tetap lanjut] [Percayai situs ini]
```

### Ambang skor

| Ambang | Nilai | Efek |
|---|---|---|
| `monitor` | 45 | Form dan request mulai dipantau tanpa menampilkan banner. Transparency Alert hanya muncul jika data sensitif benar-benar dikirim ke domain lain. |
| `warn` | 55 | Banner kuning "Waspada" di pojok halaman. |
| `danger` | 75 | Banner merah "Berbahaya". |

Ambang pemantauan sengaja dipisahkan dari ambang banner. Dengan cara ini, perlindungan menjangkau lebih banyak halaman phishing, sementara banner hanya muncul ketika model cukup yakin, sehingga pengguna tidak terganggu oleh peringatan yang keliru.

Nilai default ada di `extension/config.js` dan dapat ditimpa oleh `model.json` hasil training.

### Penyesuaian heuristik

| Kondisi | Tambahan skor |
|---|---|
| Halaman dicapai setelah 2 redirect atau lebih | +10 |
| Halaman dibuka melalui layanan link pendek | +5 |
| Umur domain kurang dari 30 hari | +15 |

Setiap penyesuaian selalu ditampilkan sebagai alasan di banner dan alert. Saat ini umur domain masih disimulasikan untuk domain demo.

---

## Model Machine Learning

| Aspek | Keterangan |
|---|---|
| Algoritma | Random Forest, 60 pohon (scikit-learn), diekspor ke JSON dan dievaluasi di JavaScript |
| Cakupan penilaian | Hanya `skema://host/` dengan awalan `www.` dibuang; path dan query diabaikan |
| Fitur (9) | `NumDots`, `HasIP`, `SubdomainCount`, `HasAtSymbol`, `NumHyphens`, `HostLength`, `NumDigits`, `HasPunycode`, `IsFreeHosting` |
| Data | [PhiUSIIL](https://archive.ics.uci.edu/dataset/967/phiusiil+phishing+url+dataset) (UCI) dan URL legit dari [Kaggle Malicious URLs](https://www.kaggle.com/datasets/sid321axn/malicious-urls-dataset); 346.503 host unik (262.284 legit, 84.219 phishing) |
| Ukuran model | ±930 KB |
| Kecocokan Python dan browser | 233 URL uji identik, selisih peluang maksimum 3,33e-16 |

### Kinerja pada data uji

Evaluasi dilakukan pada 69.301 host (20% data) yang tidak dipakai saat pelatihan.

| Ambang | Situs legit yang terkena | Phishing yang terjangkau |
|---|---|---|
| `monitor` 45 | 17,4% (hanya dipantau, tidak terlihat pengguna) | 63,6% |
| `warn` 55 | 5,3% | 51,0% |
| `danger` 75 | 1,0% | 42,6% |

ROC AUC: **0,798**. Akurasi (81,9%) tidak dipakai sebagai acuan utama karena 75,7% data uji adalah situs legit, sehingga angka akurasi terlihat lebih baik daripada kemampuan model yang sebenarnya.

### Keputusan desain

- **Penilaian berbasis host.** Seluruh URL legit di PhiUSIIL berbentuk `https://www.domain` tanpa path. Model yang menilai URL penuh akan belajar jalan pintas "punya path berarti phishing" dan salah menilai situs legit seperti dokumentasi atau artikel berita.
- **Fitur HTTPS tidak dipakai.** Situs legit di PhiUSIIL 100% memakai HTTPS, sehingga fitur ini hanya mengajarkan asal dataset, bukan ciri phishing.
- **Fitur `IsFreeHosting`.** Layanan hosting gratis (misalnya `web.app`, `weebly.com`, `repl.co`) dipakai oleh 30,8% host phishing, tetapi hanya 0,09% host legit. Fitur ini juga mencegah domain Indonesia seperti `.go.id`, `.ac.id`, dan `.co.id` ikut dinilai mencurigakan.

Penjelasan lengkap tersedia di [ml/README.md](ml/README.md).

---

## Instalasi

Folder `extension/` yang sama dipakai di semua browser tanpa proses build.

| Browser | Versi minimum | Status |
|---|---|---|
| Chrome, Edge, Brave, Opera, Vivaldi | Chromium 121 | Didukung penuh |
| Firefox (desktop) | 128 | Didukung penuh |
| Firefox Android | 128 | Belum diuji |
| Safari (macOS/iOS) | 18 | Perlu konversi melalui Xcode, belum diuji |

### Chrome, Edge, Brave, Opera, Vivaldi

1. Buka halaman ekstensi: `chrome://extensions`, `edge://extensions`, `brave://extensions`, `opera://extensions`, atau `vivaldi:extensions`.
2. Aktifkan **Developer mode**.
3. Klik **Load unpacked** dan pilih folder `extension/` (bukan root repositori).

Peringatan *"Unrecognized manifest key 'browser_specific_settings'"* dapat diabaikan. Kunci tersebut khusus untuk Firefox dan Safari.

### Firefox

1. Buka `about:debugging#/runtime/this-firefox`.
2. Klik **Load Temporary Add-on** dan pilih file `extension/manifest.json`.
3. Jika popup menampilkan pesan belum memiliki izin membaca situs, klik **Beri izin akses situs**.

Add-on sementara akan hilang saat Firefox ditutup. Untuk pemasangan permanen, add-on perlu ditandatangani Mozilla melalui [addons.mozilla.org](https://addons.mozilla.org/developers/) (sebagai *unlisted*) atau `web-ext sign`.

Pengujian dengan [web-ext](https://github.com/mozilla/web-ext):

```bash
npx web-ext lint --source-dir extension   # validasi manifest dan kode
npx web-ext run  --source-dir extension   # buka Firefox dengan ekstensi terpasang
```

### Safari (macOS, memerlukan Xcode)

```bash
xcrun safari-web-extension-converter extension/ --app-name PhishShield
```

Jalankan proyek Xcode yang dihasilkan, lalu aktifkan ekstensi di Safari > Settings > Extensions. Jika `webRequest` tidak tersedia, pelacakan redirect otomatis dinonaktifkan, tetapi fitur lainnya tetap berjalan.

### Catatan teknis lintas browser

- `lib/compat.js` menyeragamkan namespace sehingga seluruh kode memakai `browser.*` (di Chrome, `browser` merujuk ke `chrome`).
- `manifest.json` memuat `background.service_worker` (Chrome) sekaligus `background.scripts` (Firefox dan Safari).
- Daftar file di `background.scripts` pada manifest dan `importScripts` di `background.js` harus sama, termasuk urutannya.

---

## Penggunaan

Setelah terpasang, PhishShield bekerja otomatis di setiap halaman. Popup ekstensi menyediakan:

| Menu | Fungsi |
|---|---|
| Status halaman | Risk Score, level, dan alasan penilaian halaman yang sedang dibuka |
| Cek link | Mengikuti redirect sebuah link (misalnya link pendek) untuk melihat tujuan akhirnya |
| Riwayat peringatan | Daftar Transparency Alert yang pernah muncul (jenis data dan domain saja) |
| Situs tepercaya milikmu | Domain yang ditandai tepercaya melalui alert atau tombol **Percayai situs ini** |
| Pengaturan & model | Mode ketat, Mode uji (unduh CSV), informasi model, dan uji kecocokan model |

---

## Melatih Ulang Model

Panduan lengkap tersedia di [ml/README.md](ml/README.md). Ringkasnya:

```bash
cd ml
pip install -r requirements.txt
# Unduh malicious_phish.csv dari Kaggle ke ml/data/raw/malicious_phish.csv
jupyter lab train.ipynb   # jalankan semua sel; PhiUSIIL diunduh otomatis dari UCI
```

Notebook akan menulis `extension/model/model.json` dan `extension/model/test_vectors.json`. Setelah itu:

1. Reload ekstensi di halaman ekstensi browser.
2. Buka popup, lalu **Pengaturan & model** > **Uji kecocokan model**. Semua URL uji harus cocok.

Fitur di `ml/features.py` dan `extension/features.js` wajib menghasilkan angka yang sama persis. Halaman uji kecocokan memastikan hal tersebut.

---

## Demo

Skenario demo lokal (link pendek tiruan, halaman login tiruan, dan collector) dijelaskan di [demo/README.md](demo/README.md).

```bash
python3 demo/server.py
# Buka http://localhost:8000/ lalu ikuti link pendek yang tersedia
```

Halaman login demo bersifat generik dan tidak meniru situs asli mana pun. Server hanya berjalan di `127.0.0.1`.

---

## Struktur Repositori

```
.
├── extension/                 Folder yang dipasang ke browser (Load unpacked)
│   ├── manifest.json          Konfigurasi Manifest V3
│   ├── background.js          Service worker: whitelist, redirect, fitur, ML, skor
│   ├── content.js             Banner, pemantauan form, Transparency Alert
│   ├── page-hook.js           Pembungkus fetch / XHR / form.submit() milik halaman
│   ├── sensitive.js           Pengenalan jenis data sensitif (tanpa menyimpan isinya)
│   ├── features.js            Ekstraksi fitur URL (pasangan ml/features.py)
│   ├── risk.js                Skor model + heuristik menjadi level dan alasan
│   ├── unshortener.js         Rantai redirect dan Cek link
│   ├── whitelist.js           Domain tepercaya, pengecualian, domain analitik/iklan
│   ├── cache.js               Cache skor per halaman (24 jam)
│   ├── config.js              Ambang skor, poin heuristik, daftar link pendek
│   ├── lib/                   compat.js, domain.js, suffix-list.js, storage.js
│   ├── model/                 model.json, test_vectors.json, ml-engine.js
│   ├── ui/                    Popup, gaya banner, halaman uji kecocokan
│   └── icons/                 Ikon ekstensi (sumber: Icon.png)
├── ml/                        Pelatihan model (lihat ml/README.md)
│   ├── train.ipynb            Notebook pelatihan, evaluasi, dan ekspor
│   ├── features.py            Ekstraksi fitur (pasangan extension/features.js)
│   ├── prepare_data.py        Penggabungan dan pembersihan dataset
│   └── export_model.py        Ekspor model ke JSON + verifikasi
├── demo/                      Demo lokal (lihat demo/README.md)
├── docs/arsip/                Catatan pengembangan sebelumnya
└── proyek-ekstensi-anti-phishing.md   Dokumen rancangan
```

---

## Privasi dan Izin

- Seluruh analisis berjalan di dalam browser. PhishShield tidak memiliki server atau backend.
- Data yang disimpan di penyimpanan lokal browser: pengaturan, daftar situs tepercaya, cache skor per halaman (24 jam), dan riwayat peringatan yang hanya berisi jenis data dan nama domain. Isi yang diketik pengguna tidak pernah disimpan.
- **Mode uji** nonaktif secara default. Jika diaktifkan, setiap halaman yang dibuka dicatat (URL tanpa query, skor, level, banner, alasan) untuk keperluan evaluasi. Catatan ini setara dengan riwayat browsing, sehingga sebaiknya dinonaktifkan dan dihapus setelah digunakan.
- Satu-satunya request jaringan dari ekstensi adalah fitur **Cek link**, yang mengikuti redirect link yang dimasukkan pengguna.

| Izin | Kegunaan |
|---|---|
| `storage` | Menyimpan pengaturan, cache skor, dan riwayat peringatan |
| `webNavigation` | Mendeteksi navigasi halaman |
| `webRequest` | Membaca rantai redirect (hanya membaca, tidak memblokir) |
| Akses `http://*/*` dan `https://*/*` | Menilai halaman dan memantau pengiriman form |

---

## Keterbatasan dan Pengembangan Lanjutan

- **Model hanya membaca nama domain.** Domain phishing yang terlihat wajar (tanpa angka, tanda hubung, subdomain, atau hosting gratis) sulit dibedakan dari situs legit. Situs legit dengan subdomain dapat memperoleh skor mendekati ambang peringatan.
- **Umur domain masih disimulasikan.** Pengembangan berikutnya: pengambilan data dari RDAP disertai cache.
- **Celah pemantauan.** Halaman yang mengirim data melalui iframe, `navigator.sendBeacon`, atau WebSocket dapat lolos dari pemantauan. Lapisan tambahan berbasis `webRequest` dapat menutup sebagian celah ini.
- **Cakupan pengujian.** Safari dan Firefox Android belum diuji secara langsung.
- **Pengembangan lanjutan:** analisis konten dan tampilan halaman, sinkronisasi pengaturan, serta dasbor statistik.

---

## Pembagian Peran

| Peran | Tanggung jawab |
|---|---|
| ML Engineer | `ml/`, `extension/features.js` (menjaga kontrak fitur), `extension/model/` |
| Extension Developer (Core) | `manifest.json`, `background.js`, `unshortener.js`, `risk.js`, `cache.js`, `config.js` |
| Extension Developer (UI dan Monitor) | `content.js`, `page-hook.js`, `sensitive.js`, `ui/`, `whitelist.js` |
| Demo dan Presentasi | `demo/`, dokumentasi, slide, video |

# 🧠 ML: Pelatihan Model PhishShield

Model kecil (Decision Tree / Random Forest) yang menilai **peluang phishing dari ciri-ciri URL**, dilatih di Python lalu dijalankan **di dalam browser** tanpa server.

```
ml/
├── features.py       # ekstraksi fitur URL, kembaran extension/features.js
├── prepare_data.py   # gabungkan dataset mentah → data/processed/urls.csv
├── train.ipynb       # latih, evaluasi, analisis ambang, ekspor
├── export_model.py   # sklearn → extension/model/model.json (+ test_vectors.json)
├── requirements.txt
├── data/             # dataset (lihat data/README.md)
└── artifacts/        # model.joblib (dibuat otomatis, tidak di-commit)
```

## Langkah-langkah

### 1. Siapkan environment

```bash
cd ml
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2–3. Ambil dataset & rapikan jadi satu CSV

**Cara tercepat:** lewati langkah ini. Sel "Muat dataset" di `train.ipynb` otomatis mengunduh PhiUSIIL dari UCI kalau `data/processed/urls.csv` belum ada.

Atau jalankan manual. PhiUSIIL bisa diunduh langsung dari UCI lewat [`ucimlrepo`](https://github.com/uci-ml-repo/ucimlrepo) (`fetch_ucirepo(id=967)`):

```bash
python prepare_data.py --source phiusiil:uci --require-scheme --balance
```

Unduhan mentah disimpan di `data/raw/phiusiil_uci_967.csv` supaya tidak mengunduh ulang (hapus file itu kalau ingin unduh lagi).

Dari file CSV yang diunduh manual (lihat [data/README.md](data/README.md)), bisa juga digabung beberapa sumber:

```bash
python prepare_data.py \
  --source phiusiil:data/raw/PhiUSIIL_Phishing_URL_Dataset.csv \
  --source malicious-phish:data/raw/malicious_phish.csv \
  --require-scheme --balance
```

- `--source PRESET:PATH` atau `PRESET:uci`, boleh diulang untuk menggabungkan beberapa dataset.
- `--require-scheme` membuang URL tanpa `http(s)://` (supaya fitur `IsHTTPS` bermakna).
- `--balance` menyamakan jumlah phishing & legit.
- Perhatikan contoh URL yang dicetak per label, pastikan label tidak terbalik!

### 4. Latih model

```bash
jupyter lab train.ipynb
```

Jalankan semua sel. Sel terakhir otomatis menulis:

- `extension/model/model.json`: model untuk ekstensi
- `extension/model/test_vectors.json`: contoh URL + hasil Python untuk uji kecocokan

Alternatif tanpa notebook (dari model yang sudah tersimpan di `artifacts/model.joblib`):

```bash
python export_model.py
```

### 5. Cek di ekstensi

1. `chrome://extensions` → reload PhishShield.
2. Popup → **Pengaturan & model** → **Uji kecocokan model**.
3. Semua URL harus cocok (fitur sama persis, selisih peluang < 1e-6).

## ⚠️ Kontrak fitur Python ↔ JavaScript

Model dilatih dengan `features.py` tapi dijalankan dengan `extension/features.js`. Keduanya **harus menghasilkan angka yang sama** untuk URL yang sama.

| Fitur | Definisi |
|---|---|
| `URLLength` | panjang URL kanonik (tanpa `#fragment`) |
| `NumDots` | jumlah `.` di URL kanonik |
| `HasIP` | 1 kalau host berupa IPv4/IPv6 |
| `SubdomainCount` | jumlah label host sebelum domain inti (pakai `extension/lib/suffix-list.js`) |
| `HasAtSymbol` | 1 kalau ada `@` |
| `NumHyphens` | jumlah `-` |
| `IsHTTPS` | 1 kalau skema `https` |
| `HostLength`* | panjang hostname |
| `PathLength`* | panjang path |
| `NumDigits`* | jumlah digit 0–9 |
| `NumQueryParams`* | jumlah parameter query (dipisah `&`) |
| `HasPunycode`* | 1 kalau ada label `xn--` |

\* opsional, aktifkan di sel "Pilih fitur" notebook.

"URL kanonik" = URL yang sudah dinormalisasi seperti di browser: skema & host huruf kecil, punycode, port default dibuang, path kosong jadi `/`, `/a/../b` jadi `/b`, karakter khusus di-percent-encode, dan URL tanpa skema dianggap `http://`.

Kalau mengubah fitur:

1. Ubah `features.py` **dan** `extension/features.js` (urutan & definisi sama).
2. Latih ulang + ekspor.
3. Cek halaman uji kecocokan.

`model.json` menyimpan daftar fitur yang dipakai, jadi ekstensi otomatis menyesuaikan, asalkan fiturnya ada di `features.js`.

## Format `model.json`

```jsonc
{
  "format": "phishshield-trees-v1",
  "model_id": "a1b2c3d4e5f6",          // hash isi model
  "model_type": "RandomForestClassifier",
  "features": ["URLLength", "NumDots", ...],
  "thresholds": { "warn": 40, "danger": 70 },  // opsional, override extension/config.js
  "metadata": { "metrics": {...}, "created_at": "...", ... },
  "trees": [
    {
      "children_left":  [1, -1, ...],   // -1 = daun
      "children_right": [2, -1, ...],
      "feature":        [0, -2, ...],   // indeks ke "features"
      "threshold":      [54.5, 0, ...], // ke kiri kalau x <= threshold
      "proba":          [0, 0.93, ...]  // peluang phishing di daun
    }
  ]
}
```

Peluang akhir = rata-rata `proba` daun dari semua pohon (sama dengan `predict_proba` scikit-learn).

Sebelum model asli dilatih, ekstensi memakai **model placeholder** (`"placeholder": true`): satu pohon kecil yang ditulis tangan supaya tim ekstensi bisa bekerja paralel.

## Skor akhir di ekstensi

```
skor = round(peluang_model × 100)
     + 10  kalau dialihkan ≥ 2 kali
     +  5  kalau lewat link pendek (bit.ly, s.id, …)
     + 15  kalau domain berumur < 30 hari (MVP: data mock untuk domain demo)
     (maksimal 100)
```

Semua angka ini ada di `extension/config.js` dan setiap tambahan selalu muncul di daftar alasan.

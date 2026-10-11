# Folder dataset

```
data/
├── raw/         ← taruh file dataset asli di sini (tidak di-commit, lihat .gitignore)
└── processed/
    └── urls.csv ← hasil prepare_data.py: url, label (1 = phishing, 0 = legit), source
```

Sumber dataset yang bisa dipakai (cek lisensi masing-masing sebelum dipakai):

| Dataset | Preset `prepare_data.py` | Catatan |
|---|---|---|
| [PhiUSIIL Phishing URL (UCI)](https://archive.ics.uci.edu/dataset/967/phiusiil+phishing+url+dataset) | `phiusiil:uci` (unduh otomatis via `ucimlrepo`) atau `phiusiil:PATH` | **Direkomendasikan.** 235.795 URL lengkap dengan skema. Di dataset aslinya **label 1 = legit, 0 = phishing** (dibalik otomatis). URL legit-nya kebanyakan halaman depan saja, jadi uji juga dengan URL legit yang punya path panjang. |
| [Malicious URLs dataset (Kaggle)](https://www.kaggle.com/datasets/sid321axn/malicious-urls-dataset) | `malicious-phish` | Hanya `phishing` & `benign` yang dipakai. Banyak URL tanpa `http(s)://`. |
| [Phishing Site URLs (Kaggle)](https://www.kaggle.com/datasets/taruntiwarihp/phishing-site-urls) | `phishing-site-urls` | Label `bad`/`good`. URL tanpa skema. |
| CSV buatan sendiri | `generic` | Kolom `url`, `label`. |

> ❌ **UCI "Phishing Websites" (id 327) tidak bisa dipakai**: dataset itu hanya berisi fitur yang sudah dihitung (-1/0/1), tanpa URL mentah, sehingga fiturnya tidak bisa dihitung ulang di ekstensi.

> ❌ **`Phising_Detection_Dataset.csv` (kolom `NumDots, UrlLength, NumDash, …, Phising`) juga tidak cocok apa adanya**:
> - Tidak ada URL mentah, jadi definisi fiturnya tidak bisa dicocokkan dengan `extension/features.js`.
> - ±62–67% baris punya `PathLength == UrlLength`: tanda URL diproses tanpa `http(s)://` (seluruh URL dianggap path). Di browser, `location.href` selalu punya skema & host, jadi distribusinya akan sangat berbeda.
> - 32.520 baris label-nya kosong; sisanya 530.060 legit vs 100.011 phishing (tidak seimbang).

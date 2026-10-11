# 🎬 Demo Lokal PhishShield

> 🔒 Semua berjalan di komputer sendiri (`127.0.0.1`). Halaman login di sini **tiruan generik**: tidak meniru kampus, bank, atau situs asli mana pun. Jangan dibuka ke publik dan jangan dipakai untuk menipu orang.

```
demo/
├── server.py            # server lokal: link pendek tiruan + halaman login tiruan + collector
└── fake-login/
    └── index.html       # halaman login generik + tombol skenario uji
```

## Persiapan

1. Pasang ekstensi dari folder `extension/` (lihat README utama).
2. Pilih mode alamat:

   **Mode `local` (tanpa setting apa pun)**
   - Link pendek: `http://localhost:8000/s/kampus`
   - Halaman login: `http://127.0.0.1:8000/fake-login/` (host berupa IP → skor tinggi)
   - Collector: `http://localhost:8001/collect`

   **Mode `hosts` (lebih realistis, sesuai cerita di rancangan)**. Tambahkan ke `/etc/hosts` (Windows: `C:\Windows\System32\drivers\etc\hosts`):
   ```
   127.0.0.1  pendek.test login-kampus-verifikasi.free-host.test collector.ngrok-free.test
   ```
   - Link pendek: `http://pendek.test:8000/s/kampus`
   - Halaman login: `http://login-kampus-verifikasi.free-host.test:8000/fake-login/`
   - Collector: `http://collector.ngrok-free.test:8001/collect`
   - Umur domain `free-host.test` (2 hari) & `ngrok-free.test` (1 hari) di-mock di `extension/config.js`.

3. Jalankan server:
   ```bash
   python3 demo/server.py              # mode local
   python3 demo/server.py --mode hosts # mode hosts
   ```

## Skenario presentasi (rancangan bagian 13)

| # | Langkah | Yang terlihat |
|---|---|---|
| 1 | **Masalah.** Tunjukkan link pendek. Dari tampilannya, tujuan aslinya tidak kelihatan. | — |
| 2 | **Solusi.** Klik link pendek dengan ekstensi aktif. | Dialihkan 2× ke halaman login. Banner 🔴 muncul di pojok dengan skor risiko. Klik "Lihat alasan": alamat IP / banyak tanda hubung, dialihkan 2 kali (mode `hosts` juga: lewat link pendek, domain baru). Popup ekstensi menampilkan detail yang sama. |
| 2b | Atau: popup → **Cek link** → tempel link pendek. | Tujuan akhir + skor, tanpa membuka halamannya. |
| 3 | **Momen utama.** Isi email & password dummy lalu tekan **Masuk**. | **Transparency Alert**: Password & Email → domain collector, beserta alasan dan skor. Pilih **Batalkan** (data tidak terkirim), **Tetap lanjut**, atau **Percayai situs ini**. |
| 4 | **Bukti tidak mengganggu.** Buka situs aman (mis. web kampus di whitelist). | Tidak ada banner/popup, tidak terasa lambat. |
| 5 | **Penutup.** Popup → **Riwayat peringatan**. | Yang tercatat hanya jenis data & domain, bukan isinya. Semua analisis berjalan lokal. |

### Skenario uji tambahan (di halaman login, bagian "Skenario uji lain")

| Tombol | Hasil yang diharapkan |
|---|---|
| fetch() ke collector | Transparency Alert. Kalau dibatalkan, fetch gagal. |
| XMLHttpRequest ke collector | Transparency Alert. Kalau dibatalkan, XHR memicu `onerror`. |
| form.submit() dari JavaScript | Transparency Alert (submit lewat JS tidak memicu event `submit`, ditangkap `page-hook.js`). |
| Kirim password ke server sendiri | **Diam** (domain sama). |
| Kirim data tidak sensitif ke collector | **Diam** (tidak ada password/OTP/kartu/NIK). |

Catatan:
- Setelah memilih "Tetap lanjut" atau "Batalkan" untuk satu domain tujuan, pilihan itu diingat sampai halaman dimuat ulang (supaya tidak cerewet). Reload halaman untuk mencoba lagi.
- Kalau sudah klik "Percayai situs ini", hapus lagi lewat popup → **Situs tepercaya milikmu**.
- Terminal server mencetak **nama** field yang diterima collector, tidak pernah nilainya.

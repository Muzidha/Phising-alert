# Phising-alert

Next : integrasi API database phishing eksternal (PhishTank/Google Safe Browsing

sebenernya bisa ga sih membuat extensi buat mencegah phising tapi bukan hanya berdasarkan url, soalnya bisa aja di database phistank atau google safe browsing itu belum ada jadi pake url baru, atau nggak pake link shortener jadi ga bisa kedetek sama extensi

jadi aku bayanginya berdasarakan request respons nya, jadi misalkan ada transfer data secara otomatis itu ada peringatan, bukan blokir dulu tapi kaya alert tentang transparansi apa aja yang di transfer datanya dari pengguna gitu, lalu ada Machine Learningnya untuk mengidentifikasi , IPaddress , Numdot urlength dan lain lain

---


Viewed README.md:1-121
Listed directory phising-project-blocker
Viewed manifest.json:1-25
Viewed background.js:1-44
Viewed blocked.html:1-108
Viewed blocked.js:1-26

Oke, sudah saya analisis seluruh project-nya. Sekarang saya akan buat analisis lengkap beserta roadmap pengembangannya.

Edited analisis_project.md

## Jawaban Singkat: **Bisa banget!** Dan idemu itu justru lebih canggih dari kebanyakan ekstensi anti-phishing yang ada.

---

## 🔍 Kondisi Project Sekarang

Project saat ini baru sekitar **~5% dari visi yang ada di README**. Secara teknis, ekstensi ini cuma:

```
User buka URL → cek hostname vs 5 domain palsu hardcoded → kalau match, redirect ke blocked.html
```

Tidak ada content script, tidak ada ML, tidak ada monitoring request/response sama sekali.

---

## 🚨 Yang Kurang (Gap Analysis)

| # | Komponen | Status |
|---|---|---|
| 1 | **Content Script** (baca DOM, detect form) | ❌ Belum ada |
| 2 | **Request/Response Interception** (POST monitoring) | ❌ Belum ada |
| 3 | **Machine Learning** (ONNX/TF.js) | ❌ Belum ada |
| 4 | **Feature Extractor** (url_length, num_dots, entropy, dll) | ❌ Belum ada |
| 5 | **Transparency Alert Modal** (bukan blokir, tapi alert dulu) | ❌ Belum ada |
| 6 | **Link Shortener Resolver** (bit.ly, t.co, dll) | ❌ Belum ada |
| 7 | **Google Safe Browsing API** integration | ❌ Belum ada |
| 8 | **Popup UI / Settings** | ❌ Belum ada |
| 9 | `manifest.json` permissions lengkap (`scripting`, `webRequest`) | ⚠️ Kurang |

---

## 🗺️ Roadmap 5 Phase

Sudah saya buat analisis lengkap dengan kode contoh di setiap step → [lihat analisis_project.md](file:///home/archer/.gemini/antigravity-ide/brain/b1e03fff-bdd7-4afc-ab77-a2293c831e22/analisis_project.md)

### Ringkasan Phase:
1. 🔴 **Phase 1** — Buat `content-script.js` + **Transparency Alert Modal** *(ini yang paling penting duluan!)*
2. 🔴 **Phase 2** — Feature extractor + Rule-based heuristic scoring (tanpa ML dulu)
3. 🟡 **Phase 3** — URL shortener resolver + Google Safe Browsing API
4. 🟡 **Phase 4** — Train model ML (Python → ONNX) → load di service worker
5. 🟢 **Phase 5** — Popup UI, settings page, activity log

---

## 💡 Yang Paling Kritis Dikerjain Duluan

**Content Script + Alert Modal** — karena inilah inti dari idemu:
> *"misalkan ada transfer data secara otomatis itu ada peringatan, bukan blokir dulu tapi kaya alert tentang transparansi apa aja yang di transfer datanya"*

Logikanya: inject script ke setiap halaman → intercept `form.submit()` dan `fetch()` → detect kalau ada **password/email/NIK/nomor kartu** yang mau dikirim ke domain berbeda → tampilkan modal transparansi → user bisa **Izinkan** atau **Blokir**.

Mau mulai dari Phase 1 sekarang? Saya bisa langsung buatkan file-filenya.

---

Progress Tahap 1

User isi form / kirim fetch/XHR
  ↓
content-script.js deteksi apakah cross-domain?
  ↓
Scan field: password, email, NIK, nomor kartu, PIN, OTP, dll
  ↓
Jika ada data sensitif → TAHAN (preventDefault)
  ↓
Tampilkan Transparency Alert Modal:
  "📡 Tujuan: api.domain-asing.com"
  "📋 Data yang dikirim: 🔒 Password, 📧 Email"
  [🚫 Blokir]  [✅ Izinkan Sekali]
  ↓
Jika Blokir → data TIDAK dikirim, log tersimpan
Jika Izinkan → form/fetch dilanjutkan normal

Cara load ekstensi di Chrome:
Buka chrome://extensions
Aktifkan Developer mode (kanan atas)
Klik Load unpacked
Pilih folder /home/archer/Projects/phising-project-blocker

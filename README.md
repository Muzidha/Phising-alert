# Phising-alert

Next : integrasi API database phishing eksternal (PhishTank/Google Safe Browsing

Pendekatan ini sangat memungkinkan dan merupakan standar industri untuk arsitektur **Zero-Day Phishing & Exfiltration Detection**. Mengandalkan *blacklist* saja (PhishTank/Google Safe Bowsing) memang memiliki kelemahan latensi update d<Rightan rentan teknik obfuscation (link shortener, redirect chain, domain generation algorithms).

---

**Arsitektur Ekstensi Deteksi Phishing & Eksfiltrasi**

Arsitektur ini membagi sistem ke dalam 4 lapisan analisis di sisi browser (Chrome Extension Manifest V3):

1. **Unshortening & Redirect Tracing:** Menyelesaikan URL asli sebelum diakses.
2. **Feature Extraction & Local/API Machine Learning:** Klasifikasi probabilitas phishing berbasis pola URL, IP, dan DOM.
3. **Network & Payload Interception:** Memonitor request keluar (outbound POST/GET) untuk data sensitif.
4. **Transparency Alert UI:** Memberi peringatan interaktif kepada pengguna jika terdeteksi anomali.

---

**1. Ekstraksi Fitur Machine Learning (Heuristik & Struktur)**

Model Machine Learning (seperti Random Forest / LightGBM) dapat dilatih menggunakan dataset URL dengan fitur struktural berikut:

* **Fitur URL:** `url_length`, `num_dots`, `num_hyphens`, `num_at_symbols`, `has_ip_in_host`, `num_subdomains`, `entropy_score`.
* **Fitur Jaringan/Resolusi:** `is_private_ip`, `asn_reputation`, `has_punycode` (deteksi Homograph Attack).
* **Fitur Konten/DOM (Content Script):**
* Deteksi form password yang dikirim ke domain pihak ketiga (Cross-Domain Form Action).
* Keberadaan iframe transparan atau hidden login input.
* Form submission tanpa atribut HTTPS.



```python
# Contoh pipeline ekstraksi fitur URL untuk model ML
import re
import math
from urllib.parse import urlparse

def extract_url_features(url: str) -> dict:
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    path = parsed.path or ""
    
    # Hitung entropy untuk deteksi DGA/obfuscated string
    prob = [float(url.count(c)) / len(url) for c in dict.fromkeys(url)]
    entropy = -sum([p * math.log(p, 2) for p in prob]) if url else 0

    return {
        "url_length": len(url),
        "host_length": len(hostname),
        "num_dots": url.count("."),
        "num_hyphens": url.count("-"),
        "has_at_symbol": 1 if "@" in url else 0,
        "is_ip_address": 1 if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", hostname) else 0,
        "num_subdomains": len(hostname.split(".")) - 2 if len(hostname.split(".")) > 2 else 0,
        "url_entropy": round(entropy, 4)
    }

```

---

**2. Inspeksi Request / Response & Deteksi Eksfiltrasi Data**

Pada Manifest V3, inspeksi request dilakukan menggunakan kombinasi **`declarativeNetRequest`**, **`chrome.webNavigation`**, dan **`Content Scripts`** untuk membaca data form sebelum dikirim.

* **Redirect Unshortener:** Tangkap *event* navigasi awal (`chrome.webNavigation.onBeforeNavigate`). Jika domain mengarah ke shortener (misal `bit.ly`, `t.co`), resolve redirect secara background sebelum halaman utama selesai di-render.
* **Payload Interceptor (Content Script):** Pasang listener pada event `submit` form atau AJAX `fetch`/`XMLHttpRequest` wrapper untuk mendeteksi pengiriman string sensitif (format password, NIK, credit card, email) ke domain yang memiliki *ML risk score* tinggi.

```javascript
// content-script.js: Monitor Form Submission & Alert
document.addEventListener("submit", (event) => {
  const form = event.target;
  const targetAction = form.action || window.location.href;
  const currentHost = window.location.hostname;
  const actionHost = new URL(targetAction, window.location.origin).hostname;

  // Kumpulkan tipe data yang diinput
  const inputs = Array.from(form.querySelectorAll("input"));
  const transmittedTypes = [];

  inputs.forEach(input => {
    if (input.type === "password") transmittedTypes.push("Password");
    if (input.type === "email" || input.name.includes("email")) transmittedTypes.push("Email");
    if (input.value && /\b\d{16}\b/.test(input.value)) transmittedTypes.push("Potensi Nomor Kartu/Identitas");
  });

  // Jika mengirim data sensitif ke host berbeda (Cross-Domain Data Transfer)
  if (actionHost !== currentHost && transmittedTypes.length > 0) {
    event.preventDefault(); // Tahan sejenak
    
    // Kirim pesan ke background script untuk evaluasi ML dan tampilkan modal transparansi
    chrome.runtime.sendMessage({
      type: "EVALUATE_OUTBOUND_DATA",
      payload: {
        destination: targetAction,
        fields: transmittedTypes,
        host: actionHost
      }
    }, (response) => {
      if (response.userConsent) {
        form.submit(); // Lanjutkan jika pengguna mengizinkan
      }
    });
  }
}, true);

```

---

**3. Mekanisme Eksekusi Model Machine Learning**

* **Opsi A (Edge ML / Client-Side Inference):** Ekspor model (misal dari Scikit-Learn/PyTorch) ke format **ONNX** atau **TensorFlow.js**, lalu jalankan langsung di dalam *background service worker* atau *offscreen document* ekstensi. Ini menjamin privasi pengguna 100% karena data URL tidak dikirim ke server luar.
* **Opsi B (Hybrid API Verification):** Hitung fitur dasar secara lokal di browser. Jika skor berada di ambang batas abu-abu (*gray zone*), kirim hash URL/fitur ke backend scanner untuk analisis mendalam (deep packet inspection/sandbox).)

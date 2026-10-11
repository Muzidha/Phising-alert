// ============================================================
// lib/suffix-list.js — Daftar akhiran domain (public suffix) multi-bagian
//
// Dipakai untuk mencari "domain inti" (registrable domain), contoh:
//   integra.its.ac.id     → its.ac.id      ("ac.id" ada di daftar)
//   login.bank.palsu.com  → palsu.com      (default: 2 label terakhir)
//   abc.github.io         → abc.github.io  (hosting gratis: tiap subdomain = pemilik berbeda)
//
// Ini versi mini yang terinspirasi dari Public Suffix List (https://publicsuffix.org/).
//
// ⚠️ PENTING: ml/features.py membaca array di antara penanda @json-start dan
// @json-end sebagai JSON, supaya fitur SubdomainCount di Python & JS selalu
// sama. Jadi isi array harus JSON valid: kutip ganda, tanpa komentar, tanpa
// koma setelah elemen terakhir. Kalau daftar ini diubah, latih ulang model.
// ============================================================

(globalThis.PhishShield = globalThis.PhishShield || {}).suffixes =
// @json-start
[
  "ac.id", "biz.id", "co.id", "desa.id", "go.id", "mil.id", "my.id",
  "net.id", "or.id", "ponpes.id", "sch.id", "web.id",

  "ac.uk", "co.uk", "gov.uk", "ltd.uk", "me.uk", "net.uk", "org.uk", "plc.uk",
  "com.au", "edu.au", "gov.au", "net.au", "org.au",
  "ac.jp", "co.jp", "go.jp", "ne.jp", "or.jp",
  "com.sg", "edu.sg", "gov.sg", "net.sg", "org.sg",
  "com.my", "edu.my", "gov.my", "net.my", "org.my",
  "ac.in", "co.in", "gov.in", "net.in", "org.in",
  "com.br", "gov.br", "net.br", "org.br",
  "com.cn", "gov.cn", "net.cn", "org.cn",
  "com.hk", "edu.hk", "org.hk",
  "com.tw", "edu.tw", "org.tw",
  "ac.kr", "co.kr", "or.kr",
  "ac.th", "co.th", "go.th", "in.th",
  "com.vn", "edu.vn", "gov.vn",
  "com.ph", "edu.ph",
  "co.nz", "org.nz",
  "co.za", "org.za",
  "ac.il", "co.il",
  "com.ar", "com.eg", "com.mx", "com.ng", "com.pk", "com.sa", "com.tr",

  "000webhostapp.com", "appspot.com", "azurewebsites.net", "blogspot.com",
  "cloudfront.net", "firebaseapp.com", "fly.dev", "github.io", "gitlab.io",
  "glitch.me", "herokuapp.com", "loca.lt", "netlify.app", "ngrok-free.app",
  "ngrok.app", "ngrok.io", "onrender.com", "pages.dev", "repl.co", "surge.sh",
  "trycloudflare.com", "vercel.app", "web.app", "weebly.com", "wixsite.com",
  "workers.dev"
]
// @json-end
;

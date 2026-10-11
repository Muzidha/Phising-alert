// ============================================================
// sensitive.js — Mengenali data sensitif di form / body request
//
// Hanya JENIS data yang dilaporkan (mis. "Password"); isi yang diketik
// pengguna tidak pernah ditampilkan, disimpan, atau dikirim ke mana pun.
// ============================================================

(function (PS) {
  'use strict';

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

  /** Nomor kartu: 13–19 digit dan lolos cek Luhn. */
  function looksLikeCard(value) {
    const digits = value.replace(/[\s-]/g, '');
    if (!/^[0-9]{13,19}$/.test(digits)) return false;
    let sum = 0;
    let double = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = digits.charCodeAt(i) - 48;
      if (double) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      double = !double;
    }
    return sum % 10 === 0;
  }

  // Urutan = prioritas: satu field masuk ke kategori pertama yang cocok.
  // critical: true → boleh memicu Transparency Alert. Kategori lain hanya
  // ikut ditampilkan kalau alert sudah muncul (mengurangi alert fatigue).
  const CATEGORIES = [
    {
      id: 'password', icon: '🔒', label: 'Password', critical: true,
      test: (f) => f.type === 'password' || f.autocomplete.includes('password') || /\b(pass\w*|pwd|sandi|katasandi)\b/.test(f.hint),
    },
    {
      id: 'otp', icon: '🔑', label: 'Kode OTP / PIN', critical: true,
      test: (f) => f.autocomplete === 'one-time-code' || /\b(otp|pin|mpin|2fa|mfa|totp|token)\b|one time|kode verifikasi|verification code/.test(f.hint),
    },
    {
      id: 'cvv', icon: '💳', label: 'CVV kartu', critical: true,
      test: (f) => f.autocomplete === 'cc-csc' || /\b(cvv|cvv2|cvc|csc)\b|security code/.test(f.hint),
    },
    {
      id: 'card', icon: '💳', label: 'Nomor kartu kredit/debit', critical: true,
      test: (f) => f.autocomplete === 'cc-number' || /card ?(number|num|no)|cc ?(number|num)|nomor kartu|no kartu|kartu kredit|credit card/.test(f.hint) || looksLikeCard(f.value),
    },
    {
      id: 'nik', icon: '🪪', label: 'NIK / nomor identitas', critical: true,
      test: (f) => /\b(nik|ktp)\b|nomor induk kependudukan|no identitas|national id/.test(f.hint) || /^[0-9]{16}$/.test(f.value.replace(/[\s-]/g, '')),
    },
    {
      id: 'email', icon: '📧', label: 'Email', critical: false,
      test: (f) => f.type === 'email' || f.autocomplete === 'email' || /\be ?mail\b/.test(f.hint) || EMAIL_RE.test(f.value),
    },
    {
      id: 'phone', icon: '📱', label: 'Nomor telepon', critical: false,
      test: (f) => f.type === 'tel' || f.autocomplete.startsWith('tel') || /\b(phone|telp|telepon|tlp|hp|ponsel|whatsapp|wa|msisdn)\b/.test(f.hint),
    },
    {
      id: 'username', icon: '👤', label: 'Username / ID login', critical: false,
      test: (f) => f.autocomplete === 'username' || /\b(user|username|uname|userid|login|akun|account|nim|nip)\b/.test(f.hint),
    },
  ];

  /** "userPassword_1" → "user password 1" supaya \b di regex bekerja. */
  function tokenize(text) {
    return String(text || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function normalizeField(raw) {
    return {
      name: String(raw.name || ''),
      type: String(raw.type || '').toLowerCase(),
      autocomplete: String(raw.autocomplete || '').toLowerCase(),
      value: String(raw.value == null ? '' : raw.value).trim().slice(0, 500),
      hint: tokenize(raw.hint != null ? raw.hint : raw.name),
    };
  }

  /**
   * @param rawFields [{ name, value, type?, autocomplete?, hint? }]
   * @returns [{ id, icon, label, critical, fieldNames }]
   */
  function detectSensitive(rawFields) {
    const found = new Map();
    for (const raw of rawFields) {
      const field = normalizeField(raw);
      if (!field.value) continue; // field kosong tidak ikut terkirim sebagai data
      const category = CATEGORIES.find((c) => c.test(field));
      if (!category) continue;
      if (!found.has(category.id)) {
        found.set(category.id, { id: category.id, icon: category.icon, label: category.label, critical: category.critical, fieldNames: [] });
      }
      if (field.name) found.get(category.id).fieldNames.push(field.name);
    }
    return [...found.values()];
  }

  // Pakai method dari prototype: <input name="querySelectorAll"> di halaman
  // bisa "menimpa" properti form (DOM clobbering).
  const qsa = (root, selector) => Element.prototype.querySelectorAll.call(root, selector);
  const attr = (el, name) => Element.prototype.getAttribute.call(el, name);

  function labelText(el) {
    const label = el.labels && el.labels[0];
    return label ? label.textContent.slice(0, 80) : '';
  }

  /** Field yang benar-benar akan terkirim saat form di-submit. */
  function collectFormFields(form) {
    const elements = new Set(qsa(form, 'input, select, textarea'));
    const formId = attr(form, 'id');
    if (formId) {
      const linked = Document.prototype.querySelectorAll.call(document, `[form="${CSS.escape(formId)}"]`);
      for (const el of linked) elements.add(el);
    }

    const fields = [];
    for (const el of elements) {
      const name = attr(el, 'name');
      if (!name || el.disabled) continue;
      const type = (attr(el, 'type') || el.type || '').toLowerCase();
      if (['submit', 'button', 'reset', 'image', 'file'].includes(type)) continue;
      if ((type === 'checkbox' || type === 'radio') && !el.checked) continue;
      fields.push({
        name,
        type,
        autocomplete: attr(el, 'autocomplete') || '',
        value: el.value || '',
        hint: [name, el.id, attr(el, 'placeholder'), attr(el, 'aria-label'), labelText(el)].join(' '),
      });
    }
    return fields;
  }

  PS.sensitive = { detectSensitive, collectFormFields, looksLikeCard };
})(globalThis.PhishShield = globalThis.PhishShield || {});

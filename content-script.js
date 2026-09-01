// ============================================================
// content-script.js — PhishShield Phase 1
// Diinjeksikan ke setiap halaman web yang dikunjungi user.
// Tugasnya: monitor form submission & fetch/XHR, deteksi
// data sensitif yang mau dikirim ke domain berbeda, lalu
// tampilkan transparency alert sebelum data dikirim.
// ============================================================

(function () {
  'use strict';

  // --- Konfigurasi & Konstanta ---
  const PHISHSHIELD_ATTR = 'data-phishshield-monitored';

  // Regex untuk deteksi data sensitif di dalam value input
  const SENSITIVE_PATTERNS = {
    creditCard: {
      label: '💳 Nomor Kartu Kredit/Debit',
      regex: /\b(?:\d[ -]?){13,16}\b/,
    },
    nik: {
      label: '🪪 NIK / Nomor Identitas (16 digit)',
      regex: /\b\d{16}\b/,
    },
    phone: {
      label: '📱 Nomor Telepon',
      regex: /(\+62|62|0)[8][0-9]{8,11}/,
    },
    otp: {
      label: '🔑 Kode OTP',
      regex: /\b\d{4,8}\b/,
    },
  };

  // Tipe input yang selalu dianggap sensitif berdasarkan atributnya
  const SENSITIVE_INPUT_TYPES = new Set(['password', 'tel', 'email', 'number']);
  const SENSITIVE_INPUT_NAMES = ['password', 'pass', 'pwd', 'secret', 'pin', 'otp', 'token',
    'email', 'username', 'user', 'login', 'account', 'card', 'cvv', 'nik', 'ktp'];

  // ============================================================
  // UTILITAS
  // ============================================================

  /**
   * Cek apakah hostname adalah domain pihak ketiga dari halaman saat ini.
   */
  function isCrossDomain(targetHostname) {
    const currentHostname = window.location.hostname;
    if (!targetHostname || targetHostname === currentHostname) return false;
    // Cek subdomain: api.bank.com masih same-domain dengan bank.com
    const getRoot = (h) => h.split('.').slice(-2).join('.');
    return getRoot(currentHostname) !== getRoot(targetHostname);
  }

  /**
   * Ekstrak informasi sensitif dari kumpulan elemen input.
   * Mengembalikan array of { label, fieldName }.
   */
  function detectSensitiveFields(inputs) {
    const detected = [];
    const seen = new Set();

    inputs.forEach((input) => {
      if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') return;

      const type = (input.type || '').toLowerCase();
      const name = (input.name || input.id || '').toLowerCase();
      const value = input.value || '';

      const addDetection = (label, source) => {
        const key = label;
        if (!seen.has(key)) {
          seen.add(key);
          detected.push({ label, fieldName: input.name || input.id || 'unknown', source });
        }
      };

      // Cek berdasarkan tipe input
      if (type === 'password') {
        addDetection('🔒 Password', 'input-type');
      }
      if (type === 'email') {
        addDetection('📧 Alamat Email', 'input-type');
      }

      // Cek berdasarkan nama field
      const matchedName = SENSITIVE_INPUT_NAMES.find((n) => name.includes(n));
      if (matchedName && !seen.has(matchedName)) {
        const labelMap = {
          password: '🔒 Password', pass: '🔒 Password', pwd: '🔒 Password', secret: '🔒 Password',
          pin: '🔑 PIN',
          otp: '🔑 Kode OTP', token: '🔑 Token Autentikasi',
          email: '📧 Alamat Email',
          username: '👤 Username', user: '👤 Username', login: '👤 Login ID', account: '👤 Nomor Akun',
          card: '💳 Nomor Kartu', cvv: '💳 CVV Kartu',
          nik: '🪪 NIK', ktp: '🪪 Nomor KTP',
        };
        const label = labelMap[matchedName] || `📝 Field: ${name}`;
        addDetection(label, 'field-name');
      }

      // Cek berdasarkan isi value dengan regex
      if (value.length > 3) {
        for (const [, detector] of Object.entries(SENSITIVE_PATTERNS)) {
          if (detector.regex.test(value)) {
            addDetection(detector.label, 'value-pattern');
          }
        }
      }
    });

    return detected;
  }

  /**
   * Inject modal transparency alert ke halaman.
   * Modal ini menampilkan info transfer data + tombol Izinkan/Blokir.
   * Mengembalikan Promise yang resolve dengan { allow: true/false }.
   */
  function showTransparencyModal({ destination, detectedFields, formElement }) {
    return new Promise((resolve) => {
      // Pastikan tidak ada modal ganda
      const existing = document.getElementById('phishshield-modal-overlay');
      if (existing) existing.remove();

      const destinationHost = (() => {
        try { return new URL(destination).hostname; } catch { return destination; }
      })();

      const fieldsHtml = detectedFields
        .map((f) => `
          <li class="ps-field-item">
            <span class="ps-field-icon">${f.label.split(' ')[0]}</span>
            <span class="ps-field-name">${f.label.substring(f.label.indexOf(' ') + 1)}</span>
          </li>`)
        .join('');

      const overlay = document.createElement('div');
      overlay.id = 'phishshield-modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'ps-modal-title');

      overlay.innerHTML = `
        <div id="phishshield-modal" role="alertdialog">
          <div class="ps-modal-header">
            <div class="ps-shield-icon">🛡️</div>
            <div class="ps-header-text">
              <h2 id="ps-modal-title">PhishShield – Peringatan Transfer Data</h2>
              <p class="ps-subtitle">Halaman ini akan mengirim data ke domain lain</p>
            </div>
          </div>

          <div class="ps-modal-body">
            <div class="ps-destination-block">
              <span class="ps-label">📡 Tujuan Pengiriman Data:</span>
              <code class="ps-destination-url">${destinationHost}</code>
              <span class="ps-current-label">dari halaman: <code>${window.location.hostname}</code></span>
            </div>

            <div class="ps-fields-block">
              <span class="ps-label">📋 Data yang akan dikirim:</span>
              <ul class="ps-fields-list">
                ${fieldsHtml}
              </ul>
            </div>

            <div class="ps-warning-note">
              ⚠️ Jika kamu tidak sengaja mengisi form ini atau tidak mengenal situs tujuan,
              klik <strong>Blokir</strong> untuk mencegah pengiriman data.
            </div>
          </div>

          <div class="ps-modal-footer">
            <button id="ps-btn-block" class="ps-btn ps-btn-block-action">
              🚫 Blokir Pengiriman
            </button>
            <button id="ps-btn-allow" class="ps-btn ps-btn-allow-action">
              ✅ Izinkan Sekali
            </button>
          </div>
        </div>
      `;

      // Inject styles langsung ke shadow DOM agar tidak konflik dengan CSS halaman
      const styleEl = document.createElement('style');
      styleEl.textContent = getModalStyles();
      overlay.appendChild(styleEl);

      document.body.appendChild(overlay);

      // --- Event listeners ---
      const btnBlock = document.getElementById('ps-btn-block');
      const btnAllow = document.getElementById('ps-btn-allow');

      const cleanup = () => {
        overlay.classList.add('ps-fade-out');
        setTimeout(() => overlay.remove(), 300);
      };

      btnBlock.addEventListener('click', () => {
        cleanup();
        logToBackground({ type: 'BLOCKED', destination, fields: detectedFields.map(f => f.label) });
        resolve({ allow: false });
      });

      btnAllow.addEventListener('click', () => {
        cleanup();
        logToBackground({ type: 'ALLOWED', destination, fields: detectedFields.map(f => f.label) });
        resolve({ allow: true });
      });

      // Keyboard accessibility: ESC = blokir
      const handleKey = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', handleKey);
          cleanup();
          resolve({ allow: false });
        }
      };
      document.addEventListener('keydown', handleKey);

      // Animasi masuk
      requestAnimationFrame(() => overlay.classList.add('ps-visible'));
    });
  }

  /**
   * CSS untuk modal transparency alert.
   * Didesain agar tidak terpengaruh CSS halaman tujuan.
   */
  function getModalStyles() {
    return `
      #phishshield-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        background: rgba(0, 0, 0, 0.65);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
        opacity: 0;
        transition: opacity 0.25s ease;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }
      #phishshield-modal-overlay.ps-visible { opacity: 1; }
      #phishshield-modal-overlay.ps-fade-out { opacity: 0; }

      #phishshield-modal {
        background: #1a1f2e;
        border: 1px solid rgba(255, 180, 50, 0.3);
        border-top: 4px solid #f6ad55;
        border-radius: 16px;
        max-width: 480px;
        width: 100%;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(246, 173, 85, 0.1);
        overflow: hidden;
        transform: translateY(-8px);
        transition: transform 0.25s ease;
        color: #e2e8f0;
      }
      #phishshield-modal-overlay.ps-visible #phishshield-modal {
        transform: translateY(0);
      }

      .ps-modal-header {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 20px 24px 16px;
        background: rgba(246, 173, 85, 0.08);
        border-bottom: 1px solid rgba(246, 173, 85, 0.15);
      }
      .ps-shield-icon {
        font-size: 36px;
        line-height: 1;
        flex-shrink: 0;
      }
      .ps-header-text h2 {
        margin: 0 0 4px;
        font-size: 15px;
        font-weight: 700;
        color: #f6ad55;
        letter-spacing: 0.01em;
      }
      .ps-subtitle {
        margin: 0;
        font-size: 12px;
        color: #a0aec0;
      }

      .ps-modal-body {
        padding: 20px 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .ps-label {
        display: block;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #718096;
        margin-bottom: 8px;
      }

      .ps-destination-block {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        padding: 14px;
      }
      .ps-destination-url {
        display: block;
        font-size: 18px;
        font-weight: 700;
        color: #fc8181;
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
        word-break: break-all;
        margin: 4px 0 6px;
      }
      .ps-current-label {
        font-size: 11px;
        color: #718096;
      }
      .ps-current-label code {
        color: #90cdf4;
        font-size: 11px;
        font-family: 'SFMono-Regular', Consolas, monospace;
      }

      .ps-fields-block {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        padding: 14px;
      }
      .ps-fields-list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .ps-field-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        font-size: 13px;
      }
      .ps-field-icon { font-size: 16px; flex-shrink: 0; }
      .ps-field-name { color: #e2e8f0; font-weight: 500; }

      .ps-warning-note {
        font-size: 12px;
        line-height: 1.6;
        color: #a0aec0;
        background: rgba(252, 129, 129, 0.08);
        border: 1px solid rgba(252, 129, 129, 0.2);
        border-radius: 8px;
        padding: 12px;
      }

      .ps-modal-footer {
        display: flex;
        gap: 10px;
        padding: 16px 24px 20px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }
      .ps-btn {
        flex: 1;
        padding: 12px 16px;
        border: none;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        transition: transform 0.1s ease, opacity 0.2s ease;
        letter-spacing: 0.02em;
      }
      .ps-btn:hover { opacity: 0.9; transform: translateY(-1px); }
      .ps-btn:active { transform: translateY(0); }
      .ps-btn-block-action {
        background: linear-gradient(135deg, #742a2a, #c53030);
        color: #fff;
        box-shadow: 0 4px 12px rgba(197, 48, 48, 0.3);
      }
      .ps-btn-allow-action {
        background: linear-gradient(135deg, #1a365d, #2b6cb0);
        color: #fff;
        box-shadow: 0 4px 12px rgba(43, 108, 176, 0.3);
      }
    `;
  }

  /**
   * Kirim log event ke background script untuk dicatat.
   */
  function logToBackground(data) {
    chrome.runtime.sendMessage({
      type: 'LOG_EVENT',
      payload: {
        timestamp: Date.now(),
        pageUrl: window.location.href,
        ...data,
      },
    }).catch(() => {
      // Abaikan error jika background tidak merespons (normal saat SW sleep)
    });
  }

  // ============================================================
  // INTERCEPTOR 1: FORM SUBMISSION
  // ============================================================

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    // Ambil action URL form (tujuan pengiriman)
    const actionUrl = form.action || window.location.href;
    let actionHost;
    try {
      actionHost = new URL(actionUrl, window.location.origin).hostname;
    } catch {
      return; // URL tidak valid, skip
    }

    // Hanya proses jika cross-domain
    if (!isCrossDomain(actionHost)) return;

    // Kumpulkan semua input dalam form
    const inputs = Array.from(form.querySelectorAll('input, select, textarea'));
    const detectedFields = detectSensitiveFields(inputs);

    // Jika tidak ada data sensitif yang terdeteksi, biarkan form lanjut
    if (detectedFields.length === 0) return;

    // Ada data sensitif + cross-domain → tahan dan tanya user
    event.preventDefault();
    event.stopImmediatePropagation();

    const { allow } = await showTransparencyModal({
      destination: actionUrl,
      detectedFields,
      formElement: form,
    });

    if (allow) {
      // User izinkan → submit form secara native (bypass listener kita)
      form.setAttribute(PHISHSHIELD_ATTR, 'allowed');
      form.submit();
    }
    // Jika tidak allow, form sudah ditahan (preventDefault sudah dipanggil)
  }, true); // capture phase agar jalan sebelum event listener lain

  // ============================================================
  // INTERCEPTOR 2: FETCH API
  // ============================================================

  const originalFetch = window.fetch;
  window.fetch = async function (input, init = {}) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    if (!url) return originalFetch(input, init);

    let targetHost;
    try { targetHost = new URL(url, window.location.origin).hostname; } catch { return originalFetch(input, init); }

    // Hanya proses POST/PUT cross-domain (biasanya exfiltrasi data)
    const method = (init.method || 'GET').toUpperCase();
    if (!['POST', 'PUT', 'PATCH'].includes(method) || !isCrossDomain(targetHost)) {
      return originalFetch(input, init);
    }

    // Coba parse body untuk cek data sensitif
    let detectedFields = [];
    try {
      const body = init.body;
      let bodyStr = '';

      if (typeof body === 'string') bodyStr = body;
      else if (body instanceof URLSearchParams) bodyStr = body.toString();
      else if (body instanceof FormData) {
        for (const [key, val] of body.entries()) {
          bodyStr += `${key}=${val}&`;
        }
      }

      if (bodyStr.length > 0) {
        // Buat input semu untuk analisis
        const fakeInputs = bodyStr.split('&').map((pair) => {
          const [key, val] = pair.split('=');
          return {
            type: 'text',
            name: decodeURIComponent(key || ''),
            id: decodeURIComponent(key || ''),
            value: decodeURIComponent(val || ''),
          };
        });
        detectedFields = detectSensitiveFields(fakeInputs);
      }
    } catch {
      // Tidak bisa parse body, skip analisis body
    }

    // Jika tidak ada data sensitif terdeteksi, lanjutkan request normal
    if (detectedFields.length === 0) return originalFetch(input, init);

    // Ada data sensitif → tanya user
    const { allow } = await showTransparencyModal({
      destination: url,
      detectedFields,
      formElement: null,
    });

    if (allow) return originalFetch(input, init);

    // User blokir → return response error palsu (tidak sampai ke server)
    return new Response(JSON.stringify({ error: 'Diblokir oleh PhishShield' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  // ============================================================
  // INTERCEPTOR 3: XMLHttpRequest
  // ============================================================

  const OriginalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = new OriginalXHR();
    const state = { method: 'GET', url: '', blocked: false };

    const originalOpen = xhr.open.bind(xhr);
    xhr.open = function (method, url, ...rest) {
      state.method = method;
      state.url = url;
      return originalOpen(method, url, ...rest);
    };

    const originalSend = xhr.send.bind(xhr);
    xhr.send = async function (body) {
      const method = (state.method || 'GET').toUpperCase();
      if (!['POST', 'PUT', 'PATCH'].includes(method)) {
        return originalSend(body);
      }

      let targetHost;
      try { targetHost = new URL(state.url, window.location.origin).hostname; } catch { return originalSend(body); }

      if (!isCrossDomain(targetHost)) return originalSend(body);

      // Analisis body
      let detectedFields = [];
      try {
        let bodyStr = typeof body === 'string' ? body : '';
        if (body instanceof FormData) {
          for (const [key, val] of body.entries()) bodyStr += `${key}=${val}&`;
        }
        if (bodyStr) {
          const fakeInputs = bodyStr.split('&').map((pair) => {
            const [key, val] = pair.split('=');
            return { type: 'text', name: decodeURIComponent(key || ''), id: '', value: decodeURIComponent(val || '') };
          });
          detectedFields = detectSensitiveFields(fakeInputs);
        }
      } catch { /* skip */ }

      if (detectedFields.length === 0) return originalSend(body);

      // Tanya user
      const { allow } = await showTransparencyModal({
        destination: state.url,
        detectedFields,
        formElement: null,
      });

      if (allow) return originalSend(body);
      // Jika blokir, XHR tidak dikirim
    };

    return xhr;
  };

  console.debug('[PhishShield] Content script aktif di:', window.location.hostname);
})();

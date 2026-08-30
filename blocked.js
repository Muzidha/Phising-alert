// Mengambil parameter URL target dari query string
const urlParams = new URLSearchParams(window.location.search);
const targetUrl = urlParams.get('url') || 'URL Tidak Diketahui';

// Menampilkan URL yang diblokir ke halaman
document.getElementById('blocked-domain').innerText = targetUrl;

// Tombol kembali ke halaman aman (atau riwayat sebelumnya)
document.getElementById('btn-back').addEventListener('click', () => {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = 'https://www.google.com';
  }
});

// Tombol bypass jika user memaksakan akses
document.getElementById('btn-proceed').addEventListener('click', () => {
  if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
    // Tambahkan domain ke session whitelist sementara agar tidak diblokir berulang
    chrome.storage.session.set({ [new URL(targetUrl).hostname]: true }, () => {
      window.location.href = targetUrl;
    });
  }
});

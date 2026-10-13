// ============================================================
// lib/storage.js — Akses browser.storage.local
//   settings      : { enabled, strictMode }
//   trustedSites  : ["domain-inti", ...]  ← dari tombol "Percayai situs ini"
//   alertLog      : riwayat Transparency Alert (TANPA isi data yang diketik)
//   visitLog      : mode uji — situs yang dibuka + skor & banner (hanya kalau logVisits aktif)
// ============================================================

(function (PS) {
  'use strict';

  const store = () => browser.storage.local;

  async function getSettings() {
    const { settings } = await store().get('settings');
    return { ...PS.config.defaultSettings, ...(settings || {}) };
  }

  async function updateSettings(patch) {
    const next = { ...(await getSettings()), ...patch };
    await store().set({ settings: next });
    return next;
  }

  async function getTrustedSites() {
    const { trustedSites } = await store().get('trustedSites');
    return Array.isArray(trustedSites) ? trustedSites : [];
  }

  /** Simpan domain inti dari hostname, supaya semua subdomain-nya ikut tepercaya. */
  async function addTrustedSite(hostname) {
    const domain = PS.domain.getRegistrableDomain(hostname);
    if (!domain) return null;
    const list = await getTrustedSites();
    if (!list.includes(domain)) {
      list.push(domain);
      list.sort();
      await store().set({ trustedSites: list });
    }
    return domain;
  }

  async function removeTrustedSite(domain) {
    const list = (await getTrustedSites()).filter((d) => d !== domain);
    await store().set({ trustedSites: list });
  }

  async function getAlertLog() {
    const { alertLog } = await store().get('alertLog');
    return Array.isArray(alertLog) ? alertLog : [];
  }

  async function appendAlertLog(entry) {
    const log = await getAlertLog();
    log.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ts: Date.now(), ...entry });
    log.length = Math.min(log.length, PS.config.alertLogMax);
    await store().set({ alertLog: log });
  }

  async function clearAlertLog() {
    await store().remove('alertLog');
  }

  async function getVisitLog() {
    const { visitLog } = await store().get('visitLog');
    return Array.isArray(visitLog) ? visitLog : [];
  }

  // Antrean: banyak tab yang dimuat bersamaan tidak saling menimpa catatan
  let visitQueue = Promise.resolve();

  function appendVisitLog(entry) {
    visitQueue = visitQueue
      .then(async () => {
        const log = await getVisitLog();
        log.push({ ts: Date.now(), ...entry });
        if (log.length > PS.config.visitLogMax) log.splice(0, log.length - PS.config.visitLogMax);
        await store().set({ visitLog: log });
      })
      .catch(() => {});
    return visitQueue;
  }

  async function clearVisitLog() {
    await store().remove('visitLog');
  }

  PS.storage = {
    getSettings,
    updateSettings,
    getTrustedSites,
    addTrustedSite,
    removeTrustedSite,
    getAlertLog,
    appendAlertLog,
    clearAlertLog,
    getVisitLog,
    appendVisitLog,
    clearVisitLog,
  };
})(globalThis.PhishShield = globalThis.PhishShield || {});

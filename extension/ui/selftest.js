// ============================================================
// ui/selftest.js — Bandingkan hasil ekstensi dengan test vector Python
// (model/test_vectors.json dibuat oleh ml/export_model.py)
// ============================================================

(async function () {
  'use strict';

  const PS = globalThis.PhishShield;
  const $ = (id) => document.getElementById(id);
  const DEFAULT_TOLERANCE = 1e-6;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function table(headers, rows) {
    const t = el('table');
    const head = el('tr');
    headers.forEach((h) => head.append(el('th', '', h)));
    t.append(head);
    for (const cells of rows) {
      const tr = el('tr');
      for (const cell of cells) {
        const td = el('td', typeof cell === 'number' ? 'num' : '');
        td.append(cell instanceof Node ? cell : String(cell));
        tr.append(td);
      }
      t.append(tr);
    }
    return t;
  }

  // ---------- Model ----------

  let model = null;
  try {
    model = await PS.ml.loadModel();
    const meta = model.metadata || {};
    $('model-summary').replaceChildren(
      el('p', '', `ID: ${model.model_id} · tipe: ${model.model_type} · ${model.trees.length} pohon · cakupan URL: ${model.url_scope}`),
      el('p', '', `Fitur: ${model.features.join(', ')}`),
      model.placeholder
        ? el('p', 'bad', 'Ini MODEL PLACEHOLDER (belum dilatih). Jalankan ml/train.ipynb atau ml/export_model.py.')
        : el('p', 'muted', `Dibuat: ${meta.created_at || '?'} · scikit-learn ${meta.sklearn_version || '?'}`)
    );
  } catch (err) {
    $('model-summary').replaceChildren(el('p', 'bad', `Model gagal dimuat: ${err.message}`));
  }

  // ---------- Test vector ----------

  async function runVectors() {
    let data;
    try {
      const res = await fetch(browser.runtime.getURL('model/test_vectors.json'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch {
      $('vector-summary').replaceChildren(
        el('p', 'muted', 'model/test_vectors.json belum ada. File ini dibuat otomatis oleh ml/export_model.py (atau sel ekspor di train.ipynb).')
      );
      return;
    }

    const tolerance = typeof data.tolerance === 'number' ? data.tolerance : DEFAULT_TOLERANCE;
    const scope = data.url_scope || 'full'; // cakupan yang dipakai Python saat membuat test vector
    const failures = [];
    let maxDiff = 0;

    for (const vec of data.vectors) {
      let feats;
      let canonical;
      try {
        feats = PS.features.extractFeatures(vec.url, scope);
        canonical = PS.features.canonicalUrl(vec.url, scope).href;
      } catch (err) {
        failures.push({ url: vec.url, problem: `URL gagal diparse di JS: ${err.message}` });
        continue;
      }

      const diffs = Object.keys(vec.features)
        .filter((name) => feats[name] !== vec.features[name])
        .map((name) => `${name}: JS=${feats[name]} Python=${vec.features[name]}`);
      if (canonical !== vec.canonical) diffs.unshift(`URL kanonik: JS=${canonical} Python=${vec.canonical}`);

      if (model && model.model_id === data.model_id) {
        const proba = PS.ml.predictProba(model, feats);
        const diff = Math.abs(proba - vec.proba);
        maxDiff = Math.max(maxDiff, diff);
        if (diff > tolerance) diffs.push(`Peluang: JS=${proba.toFixed(6)} Python=${vec.proba.toFixed(6)}`);
      }

      if (diffs.length) failures.push({ url: vec.url, problem: diffs.join(' · ') });
    }

    const summary = [
      el('p', '', `${data.vectors.length} URL diuji (dibuat ${data.generated_at || '?'}, cakupan URL: ${scope}).`),
      failures.length === 0
        ? el('p', 'ok', `✓ Semua cocok. Selisih peluang terbesar: ${maxDiff.toExponential(2)}`)
        : el('p', 'bad', `✗ ${failures.length} URL tidak cocok. Periksa ml/features.py vs features.js.`),
    ];
    if (model && model.model_id !== data.model_id) {
      summary.push(el('p', 'bad', `model_id berbeda (model.json: ${model.model_id}, test vector: ${data.model_id}). Ekspor ulang supaya peluang ikut dibandingkan; saat ini hanya fitur yang dicek.`));
    }
    $('vector-summary').replaceChildren(...summary);

    if (failures.length) {
      $('vector-table').replaceChildren(table(['URL', 'Masalah'], failures.slice(0, 100).map((f) => [el('code', '', f.url), f.problem])));
    }
  }

  await runVectors();

  // ---------- Coba URL ----------

  $('try-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const out = $('try-result');
    try {
      const url = $('try-input').value;
      const scope = model ? model.url_scope : 'full';
      const feats = PS.features.extractFeatures(url, scope);
      const rows = PS.features.FEATURE_NAMES.map((name) => [name, feats[name], model && model.features.includes(name) ? 'dipakai model' : '']);
      const parts = [el('p', '', `URL yang dinilai model (cakupan ${scope}): `), table(['Fitur', 'Nilai', ''], rows)];
      parts[0].append(el('code', '', PS.features.canonicalUrl(url, scope).href));
      if (model) {
        const proba = PS.ml.predictProba(model, feats);
        parts.push(el('p', '', `Peluang phishing (model saja, tanpa heuristik redirect/umur domain): ${(proba * 100).toFixed(2)}%`));
      }
      out.replaceChildren(...parts);
    } catch (err) {
      out.replaceChildren(el('p', 'bad', `Gagal: ${err.message}`));
    }
  });
})();

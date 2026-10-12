// ============================================================
// model/ml-engine.js — Menjalankan model pohon keputusan di browser
//
// Format model.json ("phishshield-trees-v1") dibuat oleh ml/export_model.py:
//   features : urutan nama fitur yang dipakai model
//   url_scope: 'full' (seluruh URL) atau 'host' (hanya skema + host);
//              kalau tidak ada dianggap 'full'
//   trees    : satu pohon (Decision Tree) atau banyak (Random Forest).
//              Tiap pohon = array paralel seperti tree_ di scikit-learn:
//              children_left / children_right (-1 = daun), feature,
//              threshold, proba (peluang phishing di daun).
// Peluang akhir = rata-rata peluang semua pohon (sama dengan predict_proba
// scikit-learn).
// ============================================================

(function (PS) {
  'use strict';

  const MODEL_PATH = 'model/model.json';
  const FORMAT = 'phishshield-trees-v1';
  let modelPromise = null;

  function validateModel(model) {
    if (!model || model.format !== FORMAT) {
      throw new Error(`Format model tidak dikenal (harus "${FORMAT}")`);
    }
    if (!Array.isArray(model.features) || !Array.isArray(model.trees) || model.trees.length === 0) {
      throw new Error('model.json tidak berisi "features" atau "trees"');
    }
    for (const name of model.features) {
      if (!PS.features.FEATURE_NAMES.includes(name)) {
        throw new Error(`Fitur "${name}" tidak bisa dihitung di ekstensi (cek features.js)`);
      }
    }
    if (model.url_scope === undefined) model.url_scope = 'full';
    if (!PS.features.URL_SCOPES.includes(model.url_scope)) {
      throw new Error(`url_scope "${model.url_scope}" tidak dikenal (harus ${PS.features.URL_SCOPES.join(' / ')})`);
    }
    return model;
  }

  /** Muat model sekali, lalu pakai ulang. Gagal → coba lagi di panggilan berikutnya. */
  function loadModel() {
    if (!modelPromise) {
      modelPromise = fetch(chrome.runtime.getURL(MODEL_PATH))
        .then((res) => {
          if (!res.ok) throw new Error(`Gagal memuat ${MODEL_PATH} (HTTP ${res.status})`);
          return res.json();
        })
        .then(validateModel)
        .catch((err) => {
          modelPromise = null;
          throw err;
        });
    }
    return modelPromise;
  }

  function predictTree(tree, x) {
    const { children_left: left, children_right: right, feature, threshold, proba } = tree;
    let node = 0;
    while (left[node] !== -1) {
      node = x[feature[node]] <= threshold[node] ? left[node] : right[node];
    }
    return proba[node];
  }

  function toVector(model, features) {
    return model.features.map((name) => {
      const value = features[name];
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error(`Nilai fitur "${name}" tidak valid`);
      }
      return value;
    });
  }

  /** Peluang phishing 0–1. */
  function predictProba(model, features) {
    const x = toVector(model, features);
    let sum = 0;
    for (const tree of model.trees) sum += predictTree(tree, x);
    return sum / model.trees.length;
  }

  PS.ml = { loadModel, validateModel, predictProba };
})(globalThis.PhishShield = globalThis.PhishShield || {});

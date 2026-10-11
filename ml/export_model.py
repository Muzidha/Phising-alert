#!/usr/bin/env python3
"""
Ekspor model scikit-learn (Decision Tree / Random Forest) ke JSON untuk ekstensi.

Menghasilkan:
  extension/model/model.json         ← dibaca extension/model/ml-engine.js
  extension/model/test_vectors.json  ← dibaca extension/ui/selftest.html (cek Python == JS)

Biasanya dipanggil dari sel terakhir train.ipynb. Bisa juga dari terminal:
    python export_model.py
    python export_model.py --model artifacts/model.joblib --data data/processed/urls.csv

Sebelum menulis file, hasil JSON diverifikasi: peluang yang dihitung dari JSON
harus sama dengan model.predict_proba() scikit-learn.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
from typing import Iterable

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.tree import DecisionTreeClassifier

import features as F

ML_DIR = Path(__file__).resolve().parent
EXT_MODEL_DIR = ML_DIR.parent / 'extension' / 'model'
DEFAULT_BUNDLE = ML_DIR / 'artifacts' / 'model.joblib'
DEFAULT_MODEL_OUT = EXT_MODEL_DIR / 'model.json'
DEFAULT_VECTORS_OUT = EXT_MODEL_DIR / 'test_vectors.json'
DEFAULT_DATA = ML_DIR / 'data' / 'processed' / 'urls.csv'

FORMAT = 'phishshield-trees-v1'
VECTORS_FORMAT = 'phishshield-test-vectors-v1'
VERIFY_TOLERANCE = 1e-9
SIZE_WARNING_BYTES = 5 * 1024 * 1024

# URL "aneh" untuk menguji apakah kanonikalisasi Python sama dengan browser
EDGE_CASE_URLS = [
    'HTTP://Example.COM',
    'example.com/path?q=1#bagian',
    'https://example.com:443/',
    'http://example.com./',
    'https://example.com/?',
    'https://user@evil.example.com/login',
    'http://user:@example.com/',
    'http://0x7f.1/',
    'http://[::1]:8080/a/../b',
    'https://münchen.de/straße',
    'https://xn--pple-43d.com/',
    'https://example.com/a b"c<d>',
    'https://a.b.c.d.example.co.id/x-y-z?a=1&b=2&&c',
    'https://integra.its.ac.id/',
    'https://abc.github.io/login',
    'http://127.0.0.1:8000/fake-login/',
    'http://login-kampus-verifikasi.free-host.test:8000/fake-login/',
]


def _now() -> str:
    return dt.datetime.now().isoformat(timespec='seconds')


def _json_default(obj):
    if hasattr(obj, 'item'):  # tipe numpy
        return obj.item()
    return str(obj)


# ------------------------------------------------------------
# Konversi pohon
# ------------------------------------------------------------

def estimators_of(model) -> list:
    if isinstance(model, DecisionTreeClassifier):
        return [model]
    if isinstance(model, (RandomForestClassifier, ExtraTreesClassifier)):
        return list(model.estimators_)
    raise TypeError(
        f'Model {type(model).__name__} belum didukung. Pakai DecisionTreeClassifier atau RandomForestClassifier.'
    )


def positive_index(model) -> int:
    classes = [int(c) for c in model.classes_]
    if 1 not in classes:
        raise ValueError(f'Label phishing (1) tidak ada di model.classes_ = {classes}')
    return classes.index(1)


def tree_to_dict(estimator, pos: int) -> dict:
    """Array paralel seperti tree_ scikit-learn. proba hanya diisi di daun."""
    t = estimator.tree_
    left = t.children_left.tolist()
    right = t.children_right.tolist()
    feature, threshold, proba = [], [], []
    for node in range(t.node_count):
        if left[node] == -1:  # daun
            counts = t.value[node][0]
            total = counts.sum()
            feature.append(-2)
            threshold.append(0)
            proba.append(float(counts[pos] / total) if total > 0 else 0.0)
        else:
            feature.append(int(t.feature[node]))
            threshold.append(float(t.threshold[node]))
            proba.append(0)
    return {
        'children_left': left,
        'children_right': right,
        'feature': feature,
        'threshold': threshold,
        'proba': proba,
    }


def predict_from_payload(payload: dict, X: np.ndarray) -> np.ndarray:
    """Evaluasi JSON persis seperti ml-engine.js (dipakai untuk verifikasi)."""
    trees = payload['trees']
    out = np.zeros(len(X))
    for i, x in enumerate(X):
        total = 0.0
        for tree in trees:
            left, right = tree['children_left'], tree['children_right']
            feat, thr, proba = tree['feature'], tree['threshold'], tree['proba']
            node = 0
            while left[node] != -1:
                node = left[node] if x[feat[node]] <= thr[node] else right[node]
            total += proba[node]
        out[i] = total / len(trees)
    return out


# ------------------------------------------------------------
# Fitur
# ------------------------------------------------------------

def features_frame(urls: Iterable[str], feature_names: list[str]) -> pd.DataFrame:
    rows = [r for r in F.extract_many(urls) if r is not None]
    return pd.DataFrame(rows, columns=F.FEATURE_NAMES)[feature_names].astype(np.int64)


def sample_urls(data_path: Path, n_per_class: int, seed: int) -> list[str]:
    if not data_path.exists():
        print(f'⚠️ {data_path} tidak ada, hanya memakai URL contoh bawaan.')
        return []
    df = pd.read_csv(data_path, usecols=['url', 'label'], dtype={'url': str})
    parts = [g.sample(n=min(len(g), n_per_class), random_state=seed) for _, g in df.groupby('label')]
    return pd.concat(parts)['url'].tolist()


# ------------------------------------------------------------
# Ekspor
# ------------------------------------------------------------

def check_payload(model, payload: dict, X: pd.DataFrame) -> None:
    X = X[payload['features']]
    expected = model.predict_proba(X)[:, positive_index(model)]
    got = predict_from_payload(payload, X.to_numpy(dtype=np.float64))
    diff = float(np.max(np.abs(expected - got))) if len(X) else 0.0
    if diff > VERIFY_TOLERANCE:
        raise AssertionError(f'Hasil JSON berbeda dari scikit-learn (selisih maks {diff:.3e})')
    print(f'✓ Verifikasi JSON vs scikit-learn: {len(X):,} baris, selisih maks {diff:.2e}')


def export_bundle(bundle: dict, out_path: Path = DEFAULT_MODEL_OUT, verify_X: pd.DataFrame | None = None) -> dict:
    """
    bundle = {
        'model': estimator, 'features': [...],
        'thresholds': {'warn': 40, 'danger': 70},   # opsional, skala 0–100
        'metrics': {...}, 'dataset': {...}, 'created_at': '...'
    }
    """
    model = bundle['model']
    feature_names = list(bundle['features'])
    unknown = [f for f in feature_names if f not in F.FEATURE_NAMES]
    if unknown:
        raise ValueError(f'Fitur {unknown} tidak ada di features.py / features.js')

    pos = positive_index(model)
    trees = [tree_to_dict(e, pos) for e in estimators_of(model)]
    fingerprint = json.dumps({'features': feature_names, 'trees': trees}, separators=(',', ':'))
    model_id = hashlib.sha256(fingerprint.encode()).hexdigest()[:12]

    payload = {
        'format': FORMAT,
        'model_id': model_id,
        'model_type': type(model).__name__,
        'placeholder': False,
        'features': feature_names,
        'positive_label': 1,
        'metadata': {
            'created_at': bundle.get('created_at') or _now(),
            'sklearn_version': sklearn.__version__,
            'params': {k: v for k, v in model.get_params().items() if isinstance(v, (int, float, str, bool, type(None)))},
            'metrics': bundle.get('metrics', {}),
            'dataset': bundle.get('dataset', {}),
            'n_nodes': sum(len(t['feature']) for t in trees),
        },
        'trees': trees,
    }
    thresholds = bundle.get('thresholds')
    if thresholds:
        payload['thresholds'] = {'warn': int(thresholds['warn']), 'danger': int(thresholds['danger'])}

    check_frames = [features_frame(EDGE_CASE_URLS, feature_names)]
    if verify_X is not None:
        check_frames.append(verify_X[feature_names].astype(np.int64))
    check_payload(model, payload, pd.concat(check_frames, ignore_index=True))

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, separators=(',', ':'), ensure_ascii=False, default=_json_default)
    out_path.write_text(text, encoding='utf-8')

    size = len(text.encode('utf-8'))
    print(f'✓ Model tersimpan: {out_path} ({size / 1024:.0f} KB, {len(trees)} pohon, '
          f'{payload["metadata"]["n_nodes"]:,} node, model_id {model_id})')
    if size > SIZE_WARNING_BYTES:
        print('⚠️ File model besar. Kecilkan max_depth / n_estimators atau naikkan min_samples_leaf.')
    return payload


def write_test_vectors(bundle: dict, payload: dict, urls: Iterable[str],
                       out_path: Path = DEFAULT_VECTORS_OUT, include_edge_cases: bool = True) -> None:
    """Simpan URL + fitur + peluang versi Python, untuk dibandingkan di ui/selftest.html."""
    model = bundle['model']
    all_urls = list(dict.fromkeys(list(urls) + (EDGE_CASE_URLS if include_edge_cases else [])))

    rows = []
    for url in all_urls:
        try:
            rows.append((url, F.canonicalize(url).href, F.extract_features(url)))
        except (ValueError, TypeError):
            continue

    X = pd.DataFrame([feats for _, _, feats in rows], columns=F.FEATURE_NAMES)[payload['features']]
    proba = model.predict_proba(X)[:, positive_index(model)]
    data = {
        'format': VECTORS_FORMAT,
        'model_id': payload['model_id'],
        'generated_at': _now(),
        'tolerance': 1e-6,
        'feature_names': F.FEATURE_NAMES,
        'vectors': [
            {'url': url, 'canonical': href, 'features': feats, 'proba': float(p)}
            for (url, href, feats), p in zip(rows, proba)
        ],
    }
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=1, default=_json_default), encoding='utf-8')
    print(f'✓ Test vector tersimpan: {out_path} ({len(rows)} URL)')


def load_bundle(path: Path) -> dict:
    obj = joblib.load(path)
    if isinstance(obj, dict) and 'model' in obj:
        return obj
    # Estimator mentah tanpa metadata
    names = getattr(obj, 'feature_names_in_', None)
    return {'model': obj, 'features': list(names) if names is not None else list(F.CORE_FEATURES)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--model', type=Path, default=DEFAULT_BUNDLE, help=f'default: {DEFAULT_BUNDLE}')
    parser.add_argument('--data', type=Path, default=DEFAULT_DATA, help='CSV url,label untuk verifikasi & test vector')
    parser.add_argument('--out', type=Path, default=DEFAULT_MODEL_OUT)
    parser.add_argument('--vectors-out', type=Path, default=DEFAULT_VECTORS_OUT)
    parser.add_argument('--n-verify', type=int, default=1000, help='URL per kelas untuk verifikasi JSON')
    parser.add_argument('--n-vectors', type=int, default=100, help='URL per kelas untuk test vector')
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()

    bundle = load_bundle(args.model)
    verify_X = features_frame(sample_urls(args.data, args.n_verify, args.seed), list(bundle['features']))
    payload = export_bundle(bundle, args.out, verify_X)
    write_test_vectors(bundle, payload, sample_urls(args.data, args.n_vectors, args.seed + 1), args.vectors_out)


if __name__ == '__main__':
    main()

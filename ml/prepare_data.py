#!/usr/bin/env python3
"""
Gabungkan dataset URL phishing/legit dari berbagai sumber menjadi satu CSV
seragam: data/processed/urls.csv dengan kolom url, label (1 = phishing,
0 = legit), source.

Contoh:
    python prepare_data.py \\
        --source phiusiil:data/raw/PhiUSIIL_Phishing_URL_Dataset.csv \\
        --source malicious-phish:data/raw/malicious_phish.csv \\
        --require-scheme --balance

Format --source:  PRESET:PATH
    Preset yang tersedia ada di PRESETS di bawah. Untuk dataset lain, pakai
    preset "generic" (kolom url & label) atau tambahkan preset baru.

⚠️ Selalu cek ulang arti label di halaman dataset! Skrip ini menampilkan
contoh URL per label supaya kamu bisa memastikan pemetaannya benar.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import pandas as pd

ML_DIR = Path(__file__).resolve().parent
DEFAULT_OUT = ML_DIR / 'data' / 'processed' / 'urls.csv'
SCHEME_RE = re.compile(r'^https?://', re.IGNORECASE)

PRESETS = {
    # UCI PhiUSIIL Phishing URL Dataset — label 1 = legit, 0 = phishing (CEK ULANG)
    # https://archive.ics.uci.edu/dataset/967/phiusiil+phishing+url+dataset
    'phiusiil': dict(url_col='URL', label_col='label', phishing={'0'}, legit={'1'}),
    # Kaggle "Malicious URLs dataset" (malicious_phish.csv); defacement/malware dibuang
    # https://www.kaggle.com/datasets/sid321axn/malicious-urls-dataset
    'malicious-phish': dict(url_col='url', label_col='type', phishing={'phishing'}, legit={'benign'}),
    # Kaggle "Phishing Site URLs" (phishing_site_urls.csv)
    # https://www.kaggle.com/datasets/taruntiwarihp/phishing-site-urls
    'phishing-site-urls': dict(url_col='URL', label_col='Label', phishing={'bad'}, legit={'good'}),
    # CSV buatan sendiri: kolom url, label (1/phishing/bad vs 0/legit/legitimate/benign/good)
    'generic': dict(
        url_col='url',
        label_col='label',
        phishing={'1', 'phishing', 'bad', 'malicious'},
        legit={'0', 'legit', 'legitimate', 'benign', 'good'},
    ),
}


def load_source(spec: str) -> pd.DataFrame:
    preset_name, sep, path_str = spec.partition(':')
    if not sep or preset_name not in PRESETS:
        sys.exit(f'--source harus berbentuk PRESET:PATH, preset: {", ".join(PRESETS)} (dapat: {spec!r})')
    preset = PRESETS[preset_name]
    path = Path(path_str)
    if not path.exists():
        sys.exit(f'File tidak ditemukan: {path}')

    raw = pd.read_csv(
        path,
        usecols=[preset['url_col'], preset['label_col']],
        dtype=str,
        encoding_errors='replace',
        on_bad_lines='skip',
    )
    labels = raw[preset['label_col']].astype(str).str.strip().str.lower()
    mapped = pd.Series(pd.NA, index=raw.index, dtype='Int64')
    mapped[labels.isin(preset['phishing'])] = 1
    mapped[labels.isin(preset['legit'])] = 0

    df = pd.DataFrame({
        'url': raw[preset['url_col']].astype(str).str.strip(),
        'label': mapped,
        'source': preset_name,
    })
    dropped = int(df['label'].isna().sum())
    df = df.dropna(subset=['label'])
    df = df[df['url'].str.len() > 0]
    df['label'] = df['label'].astype(int)

    print(f'\n[{preset_name}] {path.name}: {len(df):,} baris dipakai, {dropped:,} baris label lain dibuang')
    for label, name in ((1, 'phishing'), (0, 'legit')):
        sample = df.loc[df['label'] == label, 'url'].head(3).tolist()
        print(f'  contoh {name:8s}: {sample}')
    return df


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--source', action='append', required=True, help='PRESET:PATH (boleh diulang)')
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT, help=f'default: {DEFAULT_OUT}')
    parser.add_argument('--require-scheme', action='store_true',
                        help='buang URL tanpa http:// atau https:// (penting kalau IsHTTPS dipakai)')
    parser.add_argument('--balance', action='store_true', help='samakan jumlah phishing & legit (undersampling)')
    parser.add_argument('--max-per-class', type=int, default=None, help='batasi jumlah URL per kelas')
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()

    df = pd.concat([load_source(spec) for spec in args.source], ignore_index=True)

    # URL yang sama tapi labelnya bertentangan → buang semuanya
    conflicts = df.groupby('url')['label'].nunique()
    conflict_urls = set(conflicts[conflicts > 1].index)
    if conflict_urls:
        print(f'\n{len(conflict_urls):,} URL punya label bertentangan antar sumber → dibuang')
        df = df[~df['url'].isin(conflict_urls)]
    before = len(df)
    df = df.drop_duplicates(subset='url')
    print(f'{before - len(df):,} URL duplikat dibuang')

    no_scheme = ~df['url'].str.match(SCHEME_RE)
    print(f'{int(no_scheme.sum()):,} URL ({no_scheme.mean():.1%}) tanpa http(s)://')
    if args.require_scheme:
        df = df[~no_scheme]
        print('  → dibuang (--require-scheme)')
    elif no_scheme.mean() > 0.05:
        print('  ⚠️ Banyak URL tanpa skema: fitur IsHTTPS jadi tidak bisa dipercaya.')
        print('     Pakai --require-scheme, atau buang IsHTTPS dari FEATURES di train.ipynb.')

    counts = df['label'].value_counts()
    n_per_class = int(counts.min()) if args.balance else None
    if args.max_per_class:
        n_per_class = min(n_per_class or args.max_per_class, args.max_per_class)
    if n_per_class:
        df = pd.concat(
            g.sample(n=min(len(g), n_per_class), random_state=args.seed) for _, g in df.groupby('label')
        )

    df = df.sample(frac=1, random_state=args.seed).reset_index(drop=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.out, index=False)

    print(f'\nTersimpan: {args.out}')
    print(f'  total    : {len(df):,}')
    print(f'  phishing : {int((df["label"] == 1).sum()):,}')
    print(f'  legit    : {int((df["label"] == 0).sum()):,}')
    print(df.groupby(['source', 'label']).size().unstack(fill_value=0).rename(columns={0: 'legit', 1: 'phishing'}))


if __name__ == '__main__':
    main()

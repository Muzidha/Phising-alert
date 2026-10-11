#!/usr/bin/env python3
"""
Gabungkan dataset URL phishing/legit dari berbagai sumber menjadi satu CSV
seragam: data/processed/urls.csv dengan kolom url, label (1 = phishing,
0 = legit), source.

Contoh:
    # Unduh PhiUSIIL langsung dari UCI (butuh: pip install ucimlrepo)
    python prepare_data.py --source phiusiil:uci --require-scheme --balance

    # Dari file CSV yang sudah diunduh manual, bisa digabung beberapa sumber
    python prepare_data.py \\
        --source phiusiil:data/raw/PhiUSIIL_Phishing_URL_Dataset.csv \\
        --source malicious-phish:data/raw/malicious_phish.csv \\
        --require-scheme --balance

Format --source:  PRESET:PATH  atau  PRESET:uci
    PRESET:uci mengunduh dataset lewat library ucimlrepo (hanya preset yang
    punya uci_id). Hasil unduhan disimpan di data/raw/ supaya tidak perlu
    mengunduh ulang; hapus file cache itu kalau ingin mengunduh lagi.

    Preset yang tersedia ada di PRESETS di bawah. Untuk dataset lain, pakai
    preset "generic" (kolom url & label) atau tambahkan preset baru.

⚠️ Selalu cek ulang arti label di halaman dataset! Skrip ini menampilkan
contoh URL per label supaya kamu bisa memastikan pemetaannya benar.

Bisa juga dipanggil dari Python / notebook:
    import prepare_data
    prepare_data.prepare(['phiusiil:uci'], require_scheme=True, balance=True)
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Iterable

import pandas as pd

ML_DIR = Path(__file__).resolve().parent
RAW_DIR = ML_DIR / 'data' / 'raw'
DEFAULT_OUT = ML_DIR / 'data' / 'processed' / 'urls.csv'
SCHEME_RE = re.compile(r'^https?://', re.IGNORECASE)

PRESETS = {
    # UCI PhiUSIIL Phishing URL Dataset (235.795 URL).
    # Halaman dataset: "Label 1 corresponds to a legitimate URL, label 0 to a phishing URL."
    # https://archive.ics.uci.edu/dataset/967/phiusiil+phishing+url+dataset
    'phiusiil': dict(url_col='URL', label_col='label', phishing={'0'}, legit={'1'}, uci_id=967),
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


class DataError(Exception):
    """Masalah input dataset (pesan ditampilkan apa adanya ke pengguna)."""


# ------------------------------------------------------------
# Membaca sumber data
# ------------------------------------------------------------

def fetch_uci(preset_name: str, preset: dict) -> pd.DataFrame:
    """Unduh dataset lewat ucimlrepo, lalu simpan cache CSV di data/raw/."""
    uci_id = preset.get('uci_id')
    if uci_id is None:
        raise DataError(f'Preset "{preset_name}" tidak tersedia di UCI. Pakai {preset_name}:PATH ke file CSV.')

    columns = [preset['url_col'], preset['label_col']]
    cache = RAW_DIR / f'{preset_name}_uci_{uci_id}.csv'
    if cache.exists():
        print(f'[{preset_name}] memakai cache {cache} (hapus file ini untuk mengunduh ulang)')
        return pd.read_csv(cache, usecols=columns, dtype=str)

    try:
        from ucimlrepo import fetch_ucirepo
    except ImportError as exc:
        raise DataError('Library ucimlrepo belum terpasang. Jalankan: pip install ucimlrepo') from exc

    print(f'[{preset_name}] mengunduh dataset UCI id={uci_id} … (±55 MB, bisa beberapa menit)')
    repo = fetch_ucirepo(id=uci_id)

    # data.original = semua kolom (features + targets + ids). Kolom URL ada di
    # features dan label di targets, jadi gabungkan kalau original tidak ada.
    df = getattr(repo.data, 'original', None)
    if df is None:
        df = pd.concat([part for part in (repo.data.ids, repo.data.features, repo.data.targets) if part is not None], axis=1)
    missing = [c for c in columns if c not in df.columns]
    if missing:
        raise DataError(f'Kolom {missing} tidak ada di dataset UCI. Kolom tersedia: {list(df.columns)}')

    variables = getattr(repo, 'variables', None)
    if variables is not None and 'name' in variables:
        info = variables.loc[variables['name'] == preset['label_col'], 'description']
        if len(info) and isinstance(info.iloc[0], str) and info.iloc[0].strip():
            print(f'  deskripsi kolom {preset["label_col"]} dari UCI: {info.iloc[0].strip()}')

    raw = df[columns].dropna().astype(str)
    cache.parent.mkdir(parents=True, exist_ok=True)
    raw.to_csv(cache, index=False)
    print(f'  disimpan ke {cache}')
    return raw


def read_csv_source(path_str: str, columns: list[str]) -> tuple[pd.DataFrame, str]:
    path = Path(path_str)
    if not path.exists() and not path.is_absolute() and (ML_DIR / path).exists():
        path = ML_DIR / path  # path relatif terhadap folder ml/
    if not path.exists():
        raise DataError(f'File tidak ditemukan: {path_str}')
    raw = pd.read_csv(path, usecols=columns, dtype=str, encoding_errors='replace', on_bad_lines='skip')
    return raw, path.name


def load_source(spec: str) -> pd.DataFrame:
    preset_name, sep, path_str = spec.partition(':')
    if not sep or not path_str or preset_name not in PRESETS:
        raise DataError(
            f'--source harus berbentuk PRESET:PATH atau PRESET:uci, preset: {", ".join(PRESETS)} (dapat: {spec!r})'
        )
    preset = PRESETS[preset_name]
    columns = [preset['url_col'], preset['label_col']]

    if path_str.lower() == 'uci':
        raw, origin = fetch_uci(preset_name, preset), f'UCI id {preset["uci_id"]}'
    else:
        raw, origin = read_csv_source(path_str, columns)

    # "1.0" (label float) diperlakukan sama dengan "1"
    labels = raw[preset['label_col']].astype(str).str.strip().str.lower().str.replace(r'\.0$', '', regex=True)
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

    print(f'\n[{preset_name}] {origin}: {len(df):,} baris dipakai, {dropped:,} baris label lain dibuang')
    for label, name in ((1, 'phishing'), (0, 'legit')):
        sample = df.loc[df['label'] == label, 'url'].head(3).tolist()
        print(f'  contoh {name:8s}: {sample}')
    return df


# ------------------------------------------------------------
# Menggabungkan & membersihkan
# ------------------------------------------------------------

def prepare(
    sources: Iterable[str],
    out: Path = DEFAULT_OUT,
    *,
    require_scheme: bool = False,
    balance: bool = False,
    max_per_class: int | None = None,
    seed: int = 42,
) -> pd.DataFrame:
    """Gabungkan semua sumber, bersihkan, lalu simpan ke `out`. Mengembalikan DataFrame hasilnya."""
    sources = list(sources)
    if not sources:
        raise DataError('Minimal satu --source dibutuhkan')
    df = pd.concat([load_source(spec) for spec in sources], ignore_index=True)

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
    if require_scheme:
        df = df[~no_scheme]
        print('  → dibuang (require_scheme)')
    elif no_scheme.mean() > 0.05:
        print('  ⚠️ Banyak URL tanpa skema: fitur IsHTTPS jadi tidak bisa dipercaya.')
        print('     Pakai --require-scheme, atau buang IsHTTPS dari FEATURES di train.ipynb.')

    counts = df['label'].value_counts()
    n_per_class = int(counts.min()) if balance else None
    if max_per_class:
        n_per_class = min(n_per_class or max_per_class, max_per_class)
    if n_per_class:
        df = pd.concat(
            g.sample(n=min(len(g), n_per_class), random_state=seed) for _, g in df.groupby('label')
        )

    df = df.sample(frac=1, random_state=seed).reset_index(drop=True)
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)

    print(f'\nTersimpan: {out}')
    print(f'  total    : {len(df):,}')
    print(f'  phishing : {int((df["label"] == 1).sum()):,}')
    print(f'  legit    : {int((df["label"] == 0).sum()):,}')
    print(df.groupby(['source', 'label']).size().unstack(fill_value=0).rename(columns={0: 'legit', 1: 'phishing'}))
    return df


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--source', action='append', required=True, help='PRESET:PATH atau PRESET:uci (boleh diulang)')
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT, help=f'default: {DEFAULT_OUT}')
    parser.add_argument('--require-scheme', action='store_true',
                        help='buang URL tanpa http:// atau https:// (penting kalau IsHTTPS dipakai)')
    parser.add_argument('--balance', action='store_true', help='samakan jumlah phishing & legit (undersampling)')
    parser.add_argument('--max-per-class', type=int, default=None, help='batasi jumlah URL per kelas')
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()

    try:
        prepare(
            args.source,
            args.out,
            require_scheme=args.require_scheme,
            balance=args.balance,
            max_per_class=args.max_per_class,
            seed=args.seed,
        )
    except DataError as err:
        sys.exit(f'❌ {err}')


if __name__ == '__main__':
    main()

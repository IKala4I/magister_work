"""`hourwell-train` — the one command the systemd timer, train.yml and the archive run.

Modes: --nightly (default; the ADR-0015 pipeline against DATABASE_URL), --synthetic (seed
the target database with the known ground-truth cohort first — CI only), --archive (the
whitelist surface to Parquet with hashed ids; requires ARCHIVE_SALT).
Storage credentials (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) are optional: without them
artifacts stay local, versions record artifact_uri = NULL and are never promoted.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from hourwell_training.archive import write_archive
from hourwell_training.export import Exporter
from hourwell_training.pipeline import run_nightly
from hourwell_training.registry import RegistryClient, StorageConfig
from hourwell_training.seed import seed_synthetic_db

__all__ = ["main"]


def _storage() -> StorageConfig | None:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if url and key:
        return StorageConfig(supabase_url=url.rstrip("/"), service_role_key=key)
    print("WARNING: no SUPABASE_SERVICE_ROLE_KEY — artifacts stay local, nothing promotes",
          file=sys.stderr)
    return None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="hourwell-train")
    ap.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    ap.add_argument("--out-dir", default="out", type=Path)
    ap.add_argument("--seed", default=0, type=int)
    ap.add_argument("--nightly", action="store_true",
                    help="run the nightly pipeline (the default mode; the systemd unit "
                         "passes it explicitly)")
    ap.add_argument("--synthetic", action="store_true",
                    help="seed the target database with the synthetic cohort first (CI only)")
    ap.add_argument("--archive", action="store_true",
                    help="write the Parquet archive instead of the nightly run")
    args = ap.parse_args(argv)
    if not args.database_url:
        ap.error("DATABASE_URL (or --database-url) is required")
    if args.archive:
        salt = os.environ.get("ARCHIVE_SALT", "")
        manifest = write_archive(Exporter(args.database_url), args.out_dir, salt)
        print(json.dumps(manifest, indent=2, default=str))
        return 0
    if args.synthetic:
        counts = seed_synthetic_db(args.database_url, seed=args.seed or 42)
        print(f"seeded synthetic cohort: {counts}", file=sys.stderr)
    registry = RegistryClient(conninfo=args.database_url, storage=_storage())
    summary = run_nightly(
        args.database_url, registry, args.out_dir, seed=args.seed
    )
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

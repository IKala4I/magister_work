"""Parquet archive of the whitelist surface with HASHED user ids (ADR-0015 §17).

Run at study end (`hourwell-train --archive`), never nightly. The hash is SHA-256 over
uid + ARCHIVE_SALT (a VM-only secret), so the restricted-access deposit cannot be joined
back to the live database; the salt never enters the archive. Free text cannot appear by
construction — rows come from Exporter.table(), i.e. the whitelist + gates.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq

from hourwell_training.export import DroppedRows, Exporter
from hourwell_training.whitelist import WHITELIST

__all__ = ["hash_uid", "write_archive"]

def _is_id_column(name: str) -> bool:
    """EVERY identifier is hashed — a raw recommendation/task/event id joins the deposit
    back to the live database just as surely as a user id (adversarial finding 3).
    Same salt everywhere, so joins BETWEEN archive tables survive."""
    return name == "id" or name.endswith("_id")


def hash_uid(uid: str, salt: str) -> str:
    if not salt:
        raise ValueError("ARCHIVE_SALT is required — an unsalted archive is joinable")
    return hashlib.sha256(f"{uid}:{salt}".encode()).hexdigest()


def write_archive(exporter: Exporter, out_dir: Path, salt: str) -> dict[str, Any]:
    """One Parquet file per whitelisted table + a manifest; returns the manifest."""
    out_dir.mkdir(parents=True, exist_ok=True)
    dropped = DroppedRows()
    manifest: dict[str, Any] = {"tables": {}, "dropped": dropped}
    for table in sorted(WHITELIST):
        rows: list[dict[str, Any]] = []
        for row in exporter.table(table, dropped):
            for col in list(row):
                if _is_id_column(col) and row[col] is not None:
                    row[col] = hash_uid(str(row[col]), salt)
            for k, v in row.items():
                if isinstance(v, list):
                    row[k] = json.dumps(v)  # features / top_m as JSON strings in parquet
            rows.append({k: _plain(v) for k, v in row.items()})
        if rows:
            table_arrow = pa.Table.from_pylist(rows)
            pq.write_table(table_arrow, out_dir / f"{table}.parquet")
        manifest["tables"][table] = len(rows)
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, default=str))
    return manifest


def _plain(v: Any) -> Any:
    """Stringify the driver's rich types (UUID, dates) so arrow infers stable schemas."""
    if v is None or isinstance(v, bool | int | float | str):
        return v
    return str(v)

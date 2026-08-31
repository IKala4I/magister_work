"""model_registry rows + artifact upload to the private EU Storage bucket (ADR-0015 §14).

The registry table is the system of record; the Storage object is the reproducibility
artifact. Without the service-role key the pipeline still completes but records
artifact_uri = NULL and REFUSES promotion — a promoted version must be reproducible.
"""

from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass
from typing import Any

import psycopg

from hourwell_training.params import ARTIFACT_BUCKET

__all__ = ["RegistryClient", "StorageConfig"]


@dataclass(frozen=True)
class StorageConfig:
    supabase_url: str
    service_role_key: str

    def object_url(self, path: str) -> str:
        return f"{self.supabase_url}/storage/v1/object/{ARTIFACT_BUCKET}/{path}"


@dataclass
class RegistryClient:
    conninfo: str
    storage: StorageConfig | None

    def upload(self, path: str, payload: bytes, content_type: str) -> str | None:
        """PUT one artifact object; returns the storage URI or None without credentials."""
        if self.storage is None:
            return None
        req = urllib.request.Request(
            self.storage.object_url(path),
            data=payload,
            method="POST",
            headers={
                "authorization": f"Bearer {self.storage.service_role_key}",
                "apikey": self.storage.service_role_key,
                "content-type": content_type,
                "x-upsert": "true",
            },
        )
        with urllib.request.urlopen(req, timeout=60) as res:
            if res.status not in (200, 201):
                raise RuntimeError(f"storage upload {path}: HTTP {res.status}")
        return f"storage://{ARTIFACT_BUCKET}/{path}"

    def upload_json(self, path: str, doc: dict[str, Any]) -> str | None:
        return self.upload(path, json.dumps(doc, indent=2).encode(), "application/json")

    def record(
        self,
        kind: str,
        version: str,
        artifact_uri: str | None,
        metrics: dict[str, Any],
        promoted: bool,
    ) -> None:
        if promoted and artifact_uri is None:
            raise ValueError(
                "a promoted version must carry its artifact (no storage credentials?)"
            )
        with psycopg.connect(self.conninfo) as conn:
            conn.execute(
                """
                insert into public.model_registry (kind, version, artifact_uri, metrics, promoted)
                values (%s, %s, %s, %s::jsonb, %s)
                on conflict (kind, version) do update
                  set artifact_uri = excluded.artifact_uri,
                      metrics = excluded.metrics,
                      promoted = excluded.promoted
                """,
                (kind, version, artifact_uri, json.dumps(metrics), promoted),
            )
            conn.commit()

    def next_version(self, kind: str) -> int:
        with psycopg.connect(self.conninfo) as conn:
            row = conn.execute(
                "select coalesce(max(version::int), -1) + 1 from public.model_registry "
                "where kind = %s and version ~ '^[0-9]+$'",
                (kind,),
            ).fetchone()
            return int(row[0]) if row else 0

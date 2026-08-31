"""The ONE way this package opens a Postgres connection.

On the VM, DATABASE_URL is Supabase's TRANSACTION POOLER (PgBouncer, port 6543), which does
not support server-side prepared statements — psycopg's auto-prepare after 5 executions
raises DuplicatePreparedStatement there (bit the very first live nightly run, 2026-08-31;
the recsys service learned the same lesson in P7 — runbook §6). `prepare_threshold=None`
disables auto-prepare; a direct connection (CI's local stack) is unaffected. Every call
site imports THIS helper so the setting can never be forgotten on a new query path.
"""

from __future__ import annotations

from typing import Any

import psycopg

__all__ = ["connect"]


def connect(conninfo: str, **kwargs: Any) -> psycopg.Connection[Any]:
    kwargs.setdefault("prepare_threshold", None)
    return psycopg.connect(conninfo, **kwargs)

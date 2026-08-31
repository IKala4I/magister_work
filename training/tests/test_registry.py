"""Storage auth headers per key generation (the 2026 Supabase key migration): new
`sb_secret_...` keys are not JWTs — apikey header ONLY (Bearer rejects them); the legacy
service_role JWT keeps both headers. Verified against the migration guide 2026-08-31."""

from __future__ import annotations

from hourwell_training.params import ARTIFACT_BUCKET
from hourwell_training.registry import StorageConfig


def test_new_secret_key_rides_apikey_only() -> None:
    cfg = StorageConfig(supabase_url="https://x.supabase.co", service_role_key="sb_secret_abc")
    assert cfg.auth_headers() == {"apikey": "sb_secret_abc"}


def test_legacy_jwt_keeps_both_headers() -> None:
    cfg = StorageConfig(supabase_url="https://x.supabase.co", service_role_key="eyJhbGci.x.y")
    assert cfg.auth_headers() == {
        "authorization": "Bearer eyJhbGci.x.y",
        "apikey": "eyJhbGci.x.y",
    }


def test_object_url_targets_the_models_bucket() -> None:
    cfg = StorageConfig(supabase_url="https://x.supabase.co", service_role_key="sb_secret_abc")
    assert cfg.object_url("priors/1/priors.json") == (
        f"https://x.supabase.co/storage/v1/object/{ARTIFACT_BUCKET}/priors/1/priors.json"
    )

"""The OpenAPI document (source of packages/shared/src/api.ts) exposes exactly the §5 surface."""

from __future__ import annotations

import json

from hourwell_recsys.openapi import document


def test_openapi_paths_and_operations() -> None:
    doc = json.loads(document())
    assert set(doc["paths"]) == {
        "/healthz",
        "/plan",
        "/feedback",
        "/labels",
        "/insights",
        "/parse-preview",
    }
    ops = {op["operationId"] for p in doc["paths"].values() for op in p.values()}
    assert ops == {"healthz", "plan", "feedback", "labels", "insights", "parsePreview"}
    schemas = doc["components"]["schemas"]
    assert set(schemas["FeedbackTuple"]["properties"]["reason"]["enum"]) == {
        "completed",
        "partial",
        "off_slot",
        "lapsed",
        "skipped",
        "rejected",
        "override_out",
        "override_in",
    }
    assert document() == document()  # deterministic


def test_assignment_exposes_the_replay_candidate_set() -> None:
    doc = json.loads(document())
    assert "experiment_top_m" in doc["components"]["schemas"]["Assignment"]["properties"]

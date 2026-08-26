"""`python -m hourwell_recsys.openapi` — print the OpenAPI document (deterministic key order).

`packages/shared/src/api.ts` is generated from this output with openapi-typescript; CI diffs it.
"""

from __future__ import annotations

import json
import sys

from hourwell_recsys.app import create_app
from hourwell_recsys.auth import AuthSettings
from hourwell_recsys.repo import InMemoryRepo


def document() -> str:
    app = create_app(repo=InMemoryRepo(), auth=AuthSettings(None, None))
    return json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    sys.stdout.write(document())

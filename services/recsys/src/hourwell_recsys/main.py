"""`python -m hourwell_recsys.main` — serve on $PORT (HF Spaces Docker default 7860)."""

from __future__ import annotations

import os

import uvicorn

from hourwell_recsys.app import create_app

app = create_app()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "7860")))  # noqa: S104

"""/parse-preview — server-side FALLBACK for FR-11 (primary parsing is on-device, P3).

Deterministic regex parser: durations ("2h", "90 min", "1h30"), deadlines ("by fri",
"tomorrow", "by 2026-09-01"). `category_guess` is always null: categories are form-edited,
never NL-guessed (P3 decision). Task text is parsed and returned — never stored or scored
(NFR-S3).
"""

from __future__ import annotations

import re
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from hourwell_recsys.schemas import ParsePreviewRequest, ParsePreviewResponse

_WEEKDAYS = {
    "mon": 0, "monday": 0, "tue": 1, "tues": 1, "tuesday": 1, "wed": 2, "wednesday": 2,
    "thu": 3, "thur": 3, "thurs": 3, "thursday": 3, "fri": 4, "friday": 4,
    "sat": 5, "saturday": 5, "sun": 6, "sunday": 6,
}  # fmt: skip
_DUR_HM = re.compile(r"(?<![\w.])(\d{1,2})\s*h(?:rs?|ours?)?\s*(\d{1,2})\s*(?:m|min|mins)?\b", re.I)
_DUR = re.compile(
    r"(?<![\w.])(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b", re.I
)
_DEADLINE = re.compile(
    r"\b(?:by|before|until|due)\s+(today|tomorrow|tmrw|"
    + "|".join(sorted(_WEEKDAYS, key=len, reverse=True))
    + r"|\d{4}-\d{2}-\d{2})\b",
    re.I,
)


def parse_preview(req: ParsePreviewRequest) -> ParsePreviewResponse:
    tz = ZoneInfo(req.timezone)
    now_local = req.now.astimezone(tz)
    text = req.text
    ambiguities: list[str] = []
    est: int | None = None

    m = _DUR_HM.search(text)
    if m:
        est = int(m.group(1)) * 60 + int(m.group(2))
        text = text[: m.start()] + text[m.end() :]
    else:
        durations = list(_DUR.finditer(text))
        if len(durations) > 1:
            ambiguities.append("multiple_durations")
        if durations:
            d = durations[0]
            amount = float(d.group(1).replace(",", "."))
            unit = d.group(2).lower()
            est = int(round(amount * 60)) if unit.startswith("h") else int(round(amount))
            text = text[: d.start()] + text[d.end() :]
    if est is not None and est <= 0:
        est = None

    deadline: datetime | None = None
    dls = list(_DEADLINE.finditer(text))
    if len(dls) > 1:
        ambiguities.append("multiple_dates")
    if dls:
        d = dls[0]
        token = d.group(1).lower()
        if token == "today":
            target = now_local.date()
        elif token in ("tomorrow", "tmrw"):
            target = now_local.date() + timedelta(days=1)
        elif token in _WEEKDAYS:
            ahead = (_WEEKDAYS[token] - now_local.weekday()) % 7
            if ahead == 0:
                ambiguities.append("bare_weekday_today")
            target = now_local.date() + timedelta(days=ahead)
        else:
            target = datetime.strptime(token, "%Y-%m-%d").date()
        deadline = datetime.combine(target, time(23, 59), tzinfo=tz)
        ambiguities.append("deadline_time_of_day")
        text = text[: d.start()] + text[d.end() :]

    title = re.sub(r"\s+", " ", text).strip(" ,;:-")
    return ParsePreviewResponse(
        title=title or req.text.strip(),
        category_guess=None,
        est_minutes=est,
        deadline=deadline,
        ambiguities=ambiguities,
    )

from __future__ import annotations

import uuid
from datetime import datetime, timezone


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def sanitize_input(value: str) -> str:
    import re
    return re.sub(r"[<>&\"']", "", value)

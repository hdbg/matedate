"""Small shared DB helpers for the service-role write path."""

from __future__ import annotations

import uuid
from collections.abc import Mapping
from datetime import datetime
from typing import Any


def json_row(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Make a typed write payload JSON-safe for postgrest (which serializes via json.dumps).

    datetime → ISO string, UUID → str; dicts (jsonb), None and primitives pass through.
    """
    out: dict[str, Any] = {}
    for key, value in payload.items():
        if isinstance(value, datetime):
            out[key] = value.isoformat()
        elif isinstance(value, uuid.UUID):
            out[key] = str(value)
        else:
            out[key] = value
    return out

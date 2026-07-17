"""The archetype pgmq queue. Reuses the shared `public.pgmq_*` wrappers (same as game_analysis);
only the queue name differs."""

from __future__ import annotations

from ..analysis.queue import QueueMessage, queue_archive, queue_read, queue_send

QUEUE_NAME = "game_archetype"

__all__ = ["QUEUE_NAME", "QueueMessage", "queue_archive", "queue_read", "queue_send"]

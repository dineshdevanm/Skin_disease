"""Loads app/data/seed_data.json into the knowledge_base collection and
creates the text index used for retrieval. Run with:

    python -m app.seed

Safe to re-run: documents are upserted by `id`, and index creation is
idempotent.
"""

import asyncio
import json
from pathlib import Path

from app.db import KNOWLEDGE_BASE, close_client, ensure_indexes, get_database

SEED_FILE = Path(__file__).parent / "data" / "seed_data.json"


async def seed():
    db = get_database()
    # encoding is pinned because read_text() otherwise uses the platform locale,
    # which is cp1252 on Windows and mangles the em-dashes in the seed data.
    docs = json.loads(SEED_FILE.read_text(encoding="utf-8"))

    for doc in docs:
        await db[KNOWLEDGE_BASE].replace_one({"id": doc["id"]}, doc, upsert=True)
    print(f"Upserted {len(docs)} {KNOWLEDGE_BASE} documents.")

    # Shared with the app's startup check, so the two cannot drift apart.
    await ensure_indexes()
    print(f"Ensured text index on {KNOWLEDGE_BASE}.")

    by_type: dict[str, int] = {}
    async for doc in db[KNOWLEDGE_BASE].find({}, {"type": 1}):
        by_type[doc.get("type", "unknown")] = by_type.get(doc.get("type", "unknown"), 0) + 1
    print("Collection now holds:", ", ".join(f"{n} {t}" for t, n in sorted(by_type.items())))

    close_client()


if __name__ == "__main__":
    asyncio.run(seed())

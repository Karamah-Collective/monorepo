#!/usr/bin/env python3
"""
Build semantic search embeddings for all places.

Reads data/places.json, builds a rich text description per place,
encodes with sentence-transformers (all-MiniLM-L6-v2), and writes
the result to data/embeddings.json as a base64-encoded Float32Array.

Usage:
    python scripts/build-embeddings.py

Requires:
    pip install sentence-transformers

Output format (data/embeddings.json):
    {
      "model": "all-MiniLM-L6-v2",
      "dim": 384,
      "ids": ["id1", "id2", ...],
      "data": "<base64 of concatenated Float32 vectors>"
    }

The browser loads this file, decodes the base64 blob into a typed
Float32Array, and uses cosine similarity against a query vector
produced by Transformers.js (same model, ONNX export).
"""

import json
import struct
import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ── Tag-ID to human-readable label mapping ──────────────────────────────────
# Mirrors data/tags.json so the embedding captures meaningful phrases.
TAG_LABELS = {
    "daily_prayers": "daily prayers five times a day",
    "jummah": "Jummah Friday prayer",
    "taraweeh": "Taraweeh Ramadan night prayer",
    "eid_prayer": "Eid prayer",
    "janaza": "Janaza funeral prayer",
    "quran_classes": "Quran classes Islamic education",
    "female_prayer": "sisters section women prayer area",
    "female_wudu": "sisters wudu women ablution",
    "wudu": "wudu ablution facilities",
    "quran_available": "Quran available",
    "fully_halal": "fully halal certified",
    "partially_halal": "partially halal some halal options",
    "halal_meat": "halal meat",
    "halal_butchery": "halal butcher butchery",
    "halal_fish": "halal fish seafood",
    "no_alcohol": "no alcohol alcohol-free",
    "asian_products": "Asian products groceries",
    "african_products": "African products groceries",
    "arab_products": "Arab Middle Eastern products groceries",
    "south_asian_products": "South Asian products groceries",
    "turkish_products": "Turkish products groceries",
    "european_halal": "European halal products",
}

# Place type to descriptive phrase
TYPE_LABELS = {
    "mosque": "mosque masjid Islamic place of worship",
    "prayer_room": "prayer room musalla quiet space for prayer",
    "restaurant": "restaurant halal food dining",
    "shop": "shop grocery store halal market",
}


def build_place_text(place: dict) -> str:
    """Build a rich text description that captures all searchable facets."""
    parts = [
        place.get("name", ""),
        TYPE_LABELS.get(place.get("type", ""), place.get("type", "")),
        place.get("address", ""),
    ]

    # Expand tags into readable labels
    tags = place.get("tags", {})
    for tag_id, val in tags.items():
        if val and tag_id in TAG_LABELS:
            parts.append(TAG_LABELS[tag_id])

    # Include notes if present (may contain useful details)
    notes = place.get("notes", "")
    if notes:
        parts.append(notes)

    return ". ".join(p for p in parts if p)


def main():
    places_path = ROOT / "data" / "places.json"
    output_path = ROOT / "data" / "embeddings.json"
    tags_path = ROOT / "data" / "tags.json"

    # Load places
    with open(places_path, "r", encoding="utf-8") as f:
        places = json.load(f)

    # Update TAG_LABELS from tags.json so new tags are captured
    if tags_path.exists():
        with open(tags_path, "r", encoding="utf-8") as f:
            tags_data = json.load(f)
        for _type_key, tag_list in tags_data.items():
            if isinstance(tag_list, list):
                for tag in tag_list:
                    tid = tag.get("id", "")
                    label = tag.get("label", "")
                    if tid and label and tid not in TAG_LABELS:
                        TAG_LABELS[tid] = label

    print(f"📦 Loaded {len(places)} places from {places_path.name}")

    # Build text descriptions
    ids = []
    texts = []
    for p in places:
        ids.append(p["id"])
        texts.append(build_place_text(p))

    print(f"📝 Built text descriptions ({len(texts)} entries)")
    print(f"   Sample: {texts[0][:120]}...")

    # Encode with sentence-transformers
    print("🔄 Loading model all-MiniLM-L6-v2 ...")
    from sentence_transformers import SentenceTransformer  # noqa: E402

    model = SentenceTransformer("all-MiniLM-L6-v2")
    print("🧠 Encoding place descriptions ...")
    embeddings = model.encode(texts, show_progress_bar=True, normalize_embeddings=True)

    dim = embeddings.shape[1]
    print(f"   Dimension: {dim}, Shape: {embeddings.shape}")

    # Pack into a flat Float32 binary blob and base64-encode
    flat = embeddings.astype("float32").tobytes()
    b64 = base64.b64encode(flat).decode("ascii")

    result = {
        "model": "all-MiniLM-L6-v2",
        "dim": dim,
        "ids": ids,
        "data": b64,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f)

    file_kb = output_path.stat().st_size / 1024
    print(f"✅ Wrote {output_path.name} ({file_kb:.0f} KB, {len(ids)} places, {dim}d)")


if __name__ == "__main__":
    main()

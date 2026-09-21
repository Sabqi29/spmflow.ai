"""Build deterministic SQL seed batches for the Supabase RAG knowledge base."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from sentence_transformers import SentenceTransformer


MODEL = "Supabase/gte-small"


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("chunks", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--batch-size", type=int, default=10)
    args = parser.parse_args()

    chunks = json.loads(args.chunks.read_text(encoding="utf-8"))
    model = SentenceTransformer(MODEL)
    embeddings = model.encode(
        [chunk["content_md"] for chunk in chunks],
        batch_size=32,
        normalize_embeddings=True,
        show_progress_bar=True,
    )
    if embeddings.shape != (len(chunks), 384):
        raise RuntimeError(f"Expected {(len(chunks), 384)}, received {embeddings.shape}")

    args.output.mkdir(parents=True, exist_ok=True)
    for batch_index, start in enumerate(range(0, len(chunks), args.batch_size), start=1):
        rows = []
        for chunk, embedding in zip(
            chunks[start : start + args.batch_size],
            embeddings[start : start + args.batch_size],
        ):
            vector = "[" + ",".join(f"{float(value):.8g}" for value in embedding) + "]"
            rows.append(
                "(" + ",".join(
                    [
                        sql_text(chunk["chunk_id"]),
                        sql_text(chunk["form"]),
                        sql_text(chunk["subject"]),
                        str(chunk["chapter_id"]),
                        sql_text(chunk["chapter_title"]),
                        sql_text(chunk["section_id"]),
                        sql_text(chunk["section_title"]),
                        str(chunk["current_page"]),
                        str(chunk["page_start"]),
                        str(chunk["page_end"]),
                        sql_text(chunk["content_md"]),
                        str(chunk["word_count"]),
                        sql_text(vector) + "::extensions.vector",
                    ]
                ) + ")"
            )
        sql = (
            "insert into public.rag_chunks "
            "(id, form, subject, chapter_id, chapter_title, section_id, section_title, "
            "current_page, page_start, page_end, content, word_count, embedding) values\n"
            + ",\n".join(rows)
            + "\non conflict (id) do update set "
            "form=excluded.form, subject=excluded.subject, chapter_id=excluded.chapter_id, "
            "chapter_title=excluded.chapter_title, section_id=excluded.section_id, "
            "section_title=excluded.section_title, current_page=excluded.current_page, "
            "page_start=excluded.page_start, page_end=excluded.page_end, "
            "content=excluded.content, word_count=excluded.word_count, "
            "embedding=excluded.embedding, updated_at=now();\n"
        )
        (args.output / f"{batch_index:04d}.sql").write_text(sql, encoding="utf-8")

    print(f"Built {len(chunks)} embedded chunks in {batch_index} SQL batches using {MODEL}.")


if __name__ == "__main__":
    main()

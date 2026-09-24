"""Create web-sized textbook PDFs while preserving every PDF page index.

The source files are image-only PDFs (~400 MB each). Re-encoding each page
image as JPEG brings each book below Supabase Free's 50 MB upload limit while
keeping the 1200x1600 source resolution and exact page order.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from pypdf import PdfReader, PdfWriter


def compress(source: Path, destination: Path, quality: int) -> None:
    reader = PdfReader(str(source))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)

    for index, page in enumerate(writer.pages, start=1):
        images = list(page.images)
        if len(images) != 1:
            raise RuntimeError(
                f"Expected one page image on page {index}, found {len(images)}"
            )
        image = images[0]
        image.replace(image.image.convert("RGB"), quality=quality)
        if index == 1 or index % 25 == 0 or index == len(writer.pages):
            print(f"{source.name}: compressed {index}/{len(writer.pages)} pages", flush=True)

    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as handle:
        writer.write(handle)
    print(
        f"Wrote {destination} ({destination.stat().st_size / 1024 / 1024:.1f} MB)",
        flush=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--quality", type=int, default=55)
    args = parser.parse_args()
    compress(args.source.resolve(), args.destination.resolve(), args.quality)


if __name__ == "__main__":
    main()

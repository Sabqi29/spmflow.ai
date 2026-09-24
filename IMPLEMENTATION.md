# spmflow.ai implementation status

## What is connected

- React/Vite website with `/`, `/belajar`, `/harga`, `/privasi` and `/terma` routes.
- Supabase Auth, profiles, owner-isolated chat history, quiz results, waitlist and daily tutor quotas.
- 658 Sejarah Form 4/5 RAG chunks with 384-dimensional `gte-small` embeddings, hybrid vector/full-text retrieval and page citations.
- Private Supabase Storage bucket `textbooks` containing the optimized Form 4 (264 PDF pages) and Form 5 (268 PDF pages) books.
- `spmflow-textbook` Edge Function issues one-hour signed URLs; PDF.js uses byte-range requests inside an RCI-style flipbook with a bounded seven-page render window, lazy thumbnails, page scrubber, zoom, fullscreen and download controls.
- Printed-page mapping is Form 4 `PDF page = printed page + 8` and Form 5 `PDF page = printed page + 10`.
- Clicking an AI citation switches form when necessary and opens the cited real textbook page.
- `spmflow-ask` validates the publishable key, applies 5 guest/20 user daily quotas, retrieves by form and produces either Gemini or a grounded extractive fallback.
- Production is live at `https://spmflow-demo.vercel.app`; lint, TypeScript, production build and npm audit all pass (0 known vulnerabilities).

## RCI benchmark comparison

`rci-tabung-haji-chatbot` does not run FastAPI. Its two endpoints are Next.js route handlers:

- `GET /api/search`: BM25 over committed JSON files in server memory.
- `POST /api/chat`: DeepSeek generation, streaming, cookie rate limit and in-process answer cache.

It is a one-document public reader with localStorage chat history and no database. spmflow.ai needs multi-user Auth, persistent history, quizzes, waitlist, quotas, two textbooks, private files and vector retrieval, so Supabase consolidates the data and API layer. Railway would duplicate that runtime and is not required for the current product.

## One required manual fix

Rotate the current Gemini API key because the existing secret was entered as JavaScript source instead of a raw value and its value appeared in an Edge Function error log. Then set these Edge Function secrets in Supabase:

```text
GEMINI_API_KEY=<new raw key only>
GEMINI_MODEL=gemini-2.5-flash-lite
```

Do not enter `const`, quotes, `Deno.env.get(...)` or multiple lines. The fallback remains functional until this is corrected.

## Remaining owner-account checklist

1. Supabase Auth: set Site URL to `https://spmflow-demo.vercel.app`.
2. Supabase Auth: add `https://spmflow-demo.vercel.app/belajar` and `https://spmflow-demo.vercel.app/**` to Redirect URLs; keep `http://127.0.0.1:5173/**` for development.
3. Supabase Auth: enable leaked-password protection, then configure custom SMTP before real users. The default email service is only suitable for limited testing.
4. Vercel: add a GitHub Login Connection and connect `Sabqi29/spmflow.ai` to the existing `spmflow-demo` project so future pushes deploy automatically. The current production deployment already works.
5. Vercel environment variables are optional because browser-safe defaults are present. If set, use only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; never add the service-role key.
6. After fixing Gemini and Auth settings, test signup confirmation, password reset, one T4 question, one T5 question, citation jumps and saved chat on the production domain.
7. Railway: no setup required. Consider it later only for scheduled bulk OCR/ingestion jobs that exceed Edge Function limits.

## Local verification

```powershell
npm ci
npx tsc --noEmit
npm run build
npm run dev -- --host 127.0.0.1
```

`scripts/compress_textbooks.py` reproducibly converts the image-only source PDFs into web-sized copies below the Supabase Free 50 MB per-file limit. Generated PDFs remain in ignored `artifacts/` and are not committed to Git.

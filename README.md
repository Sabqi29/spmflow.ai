# spmflow.ai

A responsive Malay-first SPM Study Space with real Sejarah Form 4/5 textbook pages, a Supabase-backed RAG tutor, citations, quizzes, Auth and saved chat history.

## Run locally

```powershell
npm ci
npm run dev -- --host 127.0.0.1
```

The production build uses `npm run build` and writes to `dist/`. Vercel routing is configured in `vercel.json`.

## Architecture

- React 18 + Vite 8 frontend, deployed at https://spmflow-demo.vercel.app.
- Supabase Auth and Postgres for user data.
- `rag_chunks` with pgvector and PostgreSQL full-text search.
- `spmflow-ask` Edge Function for retrieval, quota enforcement and Gemini/fallback answers.
- Private `textbooks` Storage bucket plus `spmflow-textbook` signed-URL function.
- PDF.js + `react-pageflip-enhanced` reader with desktop book spreads, mobile single pages, lazy thumbnails, page scrubber, fullscreen, download, accurate printed-page offsets and citation jumps.

See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for connection status, benchmark differences and the production checklist.

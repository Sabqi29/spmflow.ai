# spmflow

A responsive StudyFlow learning interface with a live Supabase-backed RAG tutor for SPM Sejarah.

- Overview with subject cards
- Textbook and tutor workspace with page navigation, zoom and source links
- Live Sejarah retrieval over 658 Form 4 and Form 5 textbook chunks
- Hybrid retrieval using Supabase `pgvector` plus PostgreSQL full-text search
- A Supabase Edge Function replacing the original FastAPI `/ask` endpoint
- Biology practice quiz with feedback and scoring
- Mobile textbook/tutor tabs

Open `dist/index.html`, or run `node server.cjs` and visit http://127.0.0.1:4173.

The Sejarah tutor calls `spmflow-ask` in Supabase. Biology and Mathematics still use deterministic sample replies. Progress on the overview is illustrative. Login, uploads and persistent student progress are not implemented yet.

## RAG architecture

The production RAG implementation was migrated from [`Sabqi29/spmflow`](https://github.com/Sabqi29/spmflow):

- `data/rag/textbook_chunks.json` is the tracked source corpus.
- `supabase/migrations/20260921035615_rag_knowledge_base.sql` creates the protected vector table and hybrid retrieval RPC.
- `supabase/functions/spmflow-ask/index.ts` embeds each question with Supabase `gte-small`, retrieves matching chunks and returns the answer contract previously served by FastAPI.
- `scripts/build_rag_seed.py` rebuilds deterministic 384-dimensional seed batches for database imports.

The `rag_chunks` table has RLS enabled and grants no browser role direct access. The Edge Function requires the named Supabase publishable key and performs retrieval through its server-side client.

If `GEMINI_API_KEY` is configured as an Edge Function secret, the function generates a concise cited tutor response. Without that secret, it returns a grounded extractive answer and marks the response with `degraded: true`.

## Rebuild the vector seed

```powershell
python -m pip install -r requirements-rag.txt
python scripts/build_rag_seed.py data/rag/textbook_chunks.json tmp/rag-seed
```

Apply the migration before importing the generated SQL batches. Never expose a Supabase secret/service-role key in the browser; `dist/config.js` contains only the browser-safe project URL and publishable key.

The reference website could not be loaded during creation; the split textbook/chat layout follows the user's description. The selected logo is preserved as supplied. The wordmark uses Nunito with local fallback fonts rather than tracing the supplied lettering.

The feature-detected `open_sample_textbook` WebMCP tool remains available in supported browsers.

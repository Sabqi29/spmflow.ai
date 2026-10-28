# spmflow.ai

A Malay-first SPM study space: real Sejarah Form 4/5 textbook pages, a Supabase-backed RAG tutor with citations, 2,560 Paper 1 trial questions graded on the server, classes with teacher controls, and a personal study guide.

Live site: https://spmflow.vercel.app (Vercel project `spmflow`, deploys from `main`).

## Run locally

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

`npm run build` writes to `dist/`. Vercel routing is in `vercel.json`.

## Checks

| Command | What it runs |
| --- | --- |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript |
| `npm test` | Vitest unit tests in `tests/` |
| `npm run test:db` | Applies new migrations to a throwaway local Postgres that mirrors the live schema (`supabase/tests/baseline.sql`), then runs the SQL tests in `supabase/tests/*.test.sql`. Needs `psql` and a local Postgres (`PGHOST`, `PGUSER`). |
| `npm run test:e2e` | Playwright smoke tests against `E2E_BASE_URL` (guest flows only) plus contract tests for the `spmflow-ask` tutor. Set `E2E_TUTOR=1` to also ask one real question. Also runnable from the **E2E smoke** GitHub workflow. |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, build and the database tests on every pull request.

## Architecture

- React 18 + Vite frontend. Pages: Laman utama, Utama (home after login), Belajar (textbook + tutor), Panduan (study guide), Latihan (Locked In / Open Book practice), Kemajuan, Nota, Kelas.
- Supabase Auth and Postgres with RLS on every table; privileged logic lives in `private.*` security-definer functions behind thin `public.*` RPC wrappers.
- Question bank in `question_sets` / `questions`. The `answer` column is not readable by API roles; `start_practice`, `submit_practice`, `get_practice_review` and `grade_guest_practice` grade on the server. Assignments carry a mode (`locked` / `open`) and an answer-release rule (`immediate`, `after_due`, `manual`, `never`) enforced in the database and in the tutor.
- `question_references` maps questions to textbook pages. Only verified rows are visible; `supabase/scripts/suggest_question_references.sql` creates unverified suggestions, and admins confirm, correct or reject them on the Semakan page (`/semakan`). Admins are rows in `private.app_admins`, added in the SQL editor.
- `rag_chunks` with pgvector and full-text search; `spmflow-ask` Edge Function is the only AI gateway: retrieval, quotas (guest 5/day, user 20/day), Locked In blocking, task types (`ask`, `hint`, `explain_wrong_answer`), removal of IC/phone/email before any model call, an answer cache for general textbook questions (`private.ai_cache`, 30 days), a site-wide daily cap (`AI_DAILY_LIMIT`, default 3000 model calls) and a usage log without text or user ids (`private.ai_usage`, summary on /semakan). Gemini settings: `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.5-flash-lite`; Google no longer offers 2.5 Flash-Lite to new keys), optional `GEMINI_INPUT_USD_PER_M` / `GEMINI_OUTPUT_USD_PER_M` for cost estimates. Textbook first: a plain question only gets a textbook answer when at least `TUTOR_MIN_COVERAGE` (default 0.6) of its specific keywords appear in one retrieved page and Gemini does not reply `TIADA_DALAM_BUKU`. Otherwise it gets a polite "di luar sukatan" reply (no quota used), or, with `TUTOR_WEB_FALLBACK=true`, a Gemini answer grounded with Google Search that the Study page labels "Jawapan dari internet, BUKAN dari buku teks" with its web links. Hints and practice explanations never use the internet. Optional `GEMINI_WEB_MODEL`, and `GEMINI_SEARCH_USD_PER_CALL` (default 0.035) for the cost estimate.
- Private `textbooks` storage bucket plus the `spmflow-textbook` signed-URL function. Printed page offsets: T4 PDF page = printed + 8, T5 = printed + 10.

## Database changes

Treat the live schema as authoritative and do not run `supabase db push` (local and live migration history differ). New migrations are tested with `npm run test:db` first, then applied individually. `20261028120100_close_direct_score_writes.sql` must only be applied after the server-graded frontend is live.

## Credits

Paper 1 question bank from [khayyum04/studyflow_v2](https://github.com/khayyum04/studyflow_v2) (2,560 questions across 68 trial sets).

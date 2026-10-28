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
| `npm run test:e2e` | Playwright smoke tests against `E2E_BASE_URL` (guest flows only). Also runnable from the **E2E smoke** GitHub workflow. |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, build and the database tests on every pull request.

## Architecture

- React 18 + Vite frontend. Pages: Laman utama, Utama (home after login), Belajar (textbook + tutor), Panduan (study guide), Latihan (Locked In / Open Book practice), Kemajuan, Nota, Kelas.
- Supabase Auth and Postgres with RLS on every table; privileged logic lives in `private.*` security-definer functions behind thin `public.*` RPC wrappers.
- Question bank in `question_sets` / `questions`. The `answer` column is not readable by API roles; `start_practice`, `submit_practice`, `get_practice_review` and `grade_guest_practice` grade on the server. Assignments carry a mode (`locked` / `open`) and an answer-release rule (`immediate`, `after_due`, `manual`, `never`) enforced in the database and in the tutor.
- `question_references` maps questions to textbook pages. Only verified rows are visible; `supabase/scripts/suggest_question_references.sql` creates unverified suggestions.
- `rag_chunks` with pgvector and full-text search; `spmflow-ask` Edge Function does retrieval, quotas (guest 5/day, user 20/day), Locked In blocking and Gemini/extractive answers with citations.
- Private `textbooks` storage bucket plus the `spmflow-textbook` signed-URL function. Printed page offsets: T4 PDF page = printed + 8, T5 = printed + 10.

## Database changes

Treat the live schema as authoritative and do not run `supabase db push` (local and live migration history differ). New migrations are tested with `npm run test:db` first, then applied individually. `20261028120100_close_direct_score_writes.sql` must only be applied after the server-graded frontend is live.

## Credits

Paper 1 question bank from [khayyum04/studyflow_v2](https://github.com/khayyum04/studyflow_v2) (2,560 questions across 68 trial sets).

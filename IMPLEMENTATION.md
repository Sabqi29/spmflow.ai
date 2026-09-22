# SPMFlow website

React/Vite website adapted from the supplied studyflow_demo_website template: retained React, Tailwind, Radix dialog, responsive section layout and package lock. The supplied RCI repository informed the side-by-side reader/tutor interaction; its source was not copied.

## Run

`npm ci`, `npm run dev`, `npm run build`. Vercel settings are in vercel.json. Routes: /, /belajar, /harga, /privasi, /terma.

## Connected features

- Supabase email/password signup, login, recovery and logout.
- Profiles, owner-isolated chat sessions/messages, quiz results and insert-only Pro waitlist.
- Existing Sejarah Edge Function, Form 4/5 filtering, source excerpts and extractive-mode badge.
- Atomic daily quota: 5 guest requests per IP; 20 authenticated requests per user. Shared networks share the guest allowance. Guest attribution depends on trusted gateway IP headers; add gateway/WAF abuse controls before public scale.
- Three-question sample quizzes per form. Scores are practice records, not authoritative exam grades.

## Media and content

- Hero: generated textbook artwork rendered into a 10-second H.264 MP4 with a looping camera zoom. This is a cinematic motion treatment of a generated still, not independently simulated 3D geometry.
- Student artwork: generated 3D-style illustration of a 9A aspiration; not a testimonial or guarantee.
- Sample textbook pages are intentionally illustrative, as requested. Source clicks display the actual returned RAG excerpt separately. No official PDF was uploaded or fabricated.

## Before public launch

- Add the final /belajar URL to Supabase Auth redirect allowlist; configure Site URL, email delivery and test real email confirmation/recovery.
- Add GEMINI_API_KEY and set a supported GEMINI_MODEL to enable generated answers. Until then, grounded extractive mode remains functional.
- Supply licensed PDFs to replace the labelled sample reader and verify actual PDF-to-printed-page offsets.
- Expand and review the question bank; multilingual UI switches BM/EN but sample Sejarah notes/questions retain their BM source language.
- Add self-service account deletion and a verified support contact; legal text describes the current private demo.
- Set up public abuse protection and audit waitlist submission limits before broad launch.

## Verification

TypeScript check and Vite production build. scripts/verify_rls.sql runs rollback-only policy and quota checks. Browser checks cover landing, language switch, real tutor request, source excerpt, quiz, pricing, auth validation and mobile layout.

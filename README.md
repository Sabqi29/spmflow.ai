# spmflow demo

A static, responsive concept for spmflow, using the user-selected logo and a rounded lowercase wordmark.

- Overview with subject cards
- Textbook and tutor workspace with sample lessons, page navigation, zoom and source links
- Biology practice quiz with feedback and scoring
- Mobile textbook/tutor tabs

Open `dist/index.html`, or run `node server.cjs` and visit http://127.0.0.1:4173.

The tutor uses deterministic sample replies, not a live AI service. Lesson text is original sample content, not an uploaded or official textbook. Progress on the overview is illustrative. No login, backend, uploads or persistent student records are implemented.

The reference website could not be loaded during creation; the split textbook/chat layout follows the user's description. The selected logo is preserved as supplied. The wordmark uses Nunito with local fallback fonts rather than tracing the supplied lettering.

Validation: JavaScript syntax and local HTTP response checked. A feature-detected `open_sample_textbook` WebMCP tool is included; no supported WebMCP validation context was available, so its runtime contract is not verified. Browser interaction and visual QA were not performed.

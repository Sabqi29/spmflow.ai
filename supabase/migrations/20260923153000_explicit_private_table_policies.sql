-- These tables are backend-only. Explicit deny policies document that intent and
-- prevent accidental browser access even if privileges are broadened later.
create policy rag_chunks_deny_browser_access
  on public.rag_chunks
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy textbooks_deny_browser_access
  on public.textbooks
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy tutor_usage_deny_browser_access
  on public.tutor_usage
  for all
  to anon, authenticated
  using (false)
  with check (false);

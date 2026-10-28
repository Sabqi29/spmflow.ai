-- Apply after the frontend that grades on the server is deployed (the old client inserts scores directly).
-- From here on, scores (and the leaderboards built on them) come only from submit_practice.
revoke insert, update, delete on public.quiz_results from anon, authenticated;
drop policy if exists quiz_insert on public.quiz_results;

revoke all on public.profiles,public.chat_sessions,public.chat_messages,public.quiz_results,public.waitlist from anon,authenticated;
grant select,insert,update on public.profiles to authenticated;
grant select,insert,update,delete on public.chat_sessions to authenticated;
grant select,insert,delete on public.chat_messages to authenticated;
grant select,insert on public.quiz_results to authenticated;
grant insert(email,source) on public.waitlist to anon,authenticated;

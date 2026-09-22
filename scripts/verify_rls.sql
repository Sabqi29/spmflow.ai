begin;
create temporary table test_users as select gen_random_uuid() as a, gen_random_uuid() as b;
insert into auth.users(id) select a from test_users union all select b from test_users;
insert into public.profiles(id,display_name) select a,'RLS test A' from test_users union all select b,'RLS test B' from test_users;
select set_config('request.jwt.claim.sub',(select a::text from test_users),true);
set local role authenticated;
do $$begin
 if (select count(*) from public.profiles) <> 1 then raise exception 'Owner isolation failed'; end if;
 insert into public.chat_sessions(user_id,title,form_level) values(auth.uid(),'Temporary RLS verification',4);
 if (select count(*) from public.chat_sessions) <> 1 then raise exception 'Session ownership failed'; end if;
 begin
   insert into public.chat_sessions(user_id,title,form_level) values(gen_random_uuid(),'Forbidden',4);
   raise exception 'Unauthorized insert succeeded';
 exception when insufficient_privilege then null;
 end;
 insert into public.chat_messages(user_id,session_id,role,content)
 select auth.uid(),id,'user','Temporary test' from public.chat_sessions;
 if (select count(*) from public.chat_messages) <> 1 then raise exception 'Message ownership failed'; end if;
 delete from public.chat_sessions;
 if (select count(*) from public.chat_messages) <> 0 then raise exception 'Cascade deletion failed'; end if;
end;$$;
reset role;
do $$begin
 if not public.consume_tutor_quota('transaction-verification',2) then raise exception 'Quota first failed';end if;
 if not public.consume_tutor_quota('transaction-verification',2) then raise exception 'Quota second failed';end if;
 if public.consume_tutor_quota('transaction-verification',2) then raise exception 'Quota limit failed';end if;
end;$$;
set local role anon;
insert into public.waitlist(email,source) values('transaction-verification@example.invalid','pricing_pro');
do $$begin
 begin
  perform 1 from public.waitlist;
  raise exception 'Anonymous waitlist read succeeded';
 exception when insufficient_privilege then null;
 end;
 begin
  perform 1 from public.rag_chunks;
  raise exception 'Anonymous corpus read succeeded';
 exception when insufficient_privilege then null;
 end;
end;$$;
reset role;
select 'PASS: owner isolation, forbidden writes, chat cascade, daily quota, anonymous waitlist write and denied reads' as result;
rollback;

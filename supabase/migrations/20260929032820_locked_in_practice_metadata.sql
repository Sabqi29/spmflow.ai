alter table public.quiz_results
  add column if not exists question_set_id text
    check (question_set_id is null or char_length(question_set_id) between 1 and 100),
  add column if not exists duration_seconds integer
    check (duration_seconds is null or duration_seconds >= 0),
  add column if not exists timer_seconds integer
    check (timer_seconds is null or timer_seconds > 0);

create index if not exists quiz_results_question_set_idx
  on public.quiz_results(question_set_id, created_at desc)
  where question_set_id is not null;

comment on column public.quiz_results.question_set_id is
  'Stable paper_key from the credited past-year question dataset.';
comment on column public.quiz_results.duration_seconds is
  'Elapsed practice time in seconds.';
comment on column public.quiz_results.timer_seconds is
  'Optional timer selected by the student, in seconds.';

create table if not exists public.textbooks (
  id text primary key,
  subject text not null default 'sejarah',
  form_level smallint not null check (form_level in (4, 5)),
  title text not null,
  storage_path text not null unique,
  printed_page_offset smallint not null,
  pdf_page_count smallint not null,
  created_at timestamptz not null default now()
);

alter table public.textbooks enable row level security;
revoke all on table public.textbooks from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('textbooks', 'textbooks', false, 52428800, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into public.textbooks
  (id, form_level, title, storage_path, printed_page_offset, pdf_page_count)
values
  ('sejarah-t4', 4, 'Sejarah Tingkatan 4', 'sejarah/sejarah-t4-web.pdf', 8, 264),
  ('sejarah-t5', 5, 'Sejarah Tingkatan 5', 'sejarah/sejarah-t5-web.pdf', 10, 268)
on conflict (id) do update
set title = excluded.title,
    storage_path = excluded.storage_path,
    printed_page_offset = excluded.printed_page_offset,
    pdf_page_count = excluded.pdf_page_count;

create index if not exists textbooks_subject_form_idx
  on public.textbooks (subject, form_level);

comment on table public.textbooks is
  'Private textbook file metadata. Files are served only through short-lived signed URLs.';

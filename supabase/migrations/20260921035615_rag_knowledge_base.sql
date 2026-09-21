create extension if not exists vector with schema extensions;

create table if not exists public.rag_chunks (
  id text primary key,
  form text not null,
  subject text not null,
  chapter_id integer not null,
  chapter_title text not null,
  section_id text not null,
  section_title text not null,
  current_page integer not null,
  page_start integer not null,
  page_end integer not null,
  content text not null,
  word_count integer not null,
  embedding extensions.vector(384),
  search_document tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(chapter_title, '') || ' ' ||
      coalesce(section_title, '') || ' ' ||
      coalesce(content, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rag_chunks enable row level security;

revoke all on table public.rag_chunks from anon, authenticated;
grant select, insert, update, delete on table public.rag_chunks to service_role;

create index if not exists rag_chunks_embedding_hnsw
  on public.rag_chunks
  using hnsw (embedding extensions.vector_ip_ops)
  where embedding is not null;

create index if not exists rag_chunks_search_document_gin
  on public.rag_chunks
  using gin (search_document);

create or replace function public.match_rag_chunks(
  query_embedding extensions.vector(384),
  query_text text,
  match_count integer default 5
)
returns table (
  id text,
  form text,
  subject text,
  chapter_id integer,
  chapter_title text,
  section_id text,
  section_title text,
  current_page integer,
  page_start integer,
  page_end integer,
  content text,
  score double precision
)
language sql
stable
security definer
set search_path = pg_catalog, extensions
as $$
  with semantic as (
    select
      c.id as chunk_id,
      row_number() over (order by c.embedding <#> query_embedding) as semantic_rank
    from public.rag_chunks as c
    where c.embedding is not null
    order by c.embedding <#> query_embedding
    limit greatest(least(match_count * 4, 100), 20)
  ),
  keyword as (
    select
      c.id as chunk_id,
      row_number() over (
        order by ts_rank_cd(c.search_document, websearch_to_tsquery('simple', query_text)) desc
      ) as keyword_rank
    from public.rag_chunks as c
    where c.search_document @@ websearch_to_tsquery('simple', query_text)
    order by ts_rank_cd(c.search_document, websearch_to_tsquery('simple', query_text)) desc
    limit greatest(least(match_count * 4, 100), 20)
  ),
  fused as (
    select
      coalesce(s.chunk_id, k.chunk_id) as chunk_id,
      (
        coalesce(1.0 / (50 + s.semantic_rank), 0.0) +
        coalesce(2.0 / (50 + k.keyword_rank), 0.0)
      )::double precision as fused_score
    from semantic as s
    full join keyword as k on s.chunk_id = k.chunk_id
  )
  select
    c.id,
    c.form,
    c.subject,
    c.chapter_id,
    c.chapter_title,
    c.section_id,
    c.section_title,
    c.current_page,
    c.page_start,
    c.page_end,
    c.content,
    f.fused_score
  from fused as f
  join public.rag_chunks as c on c.id = f.chunk_id
  order by f.fused_score desc, c.id
  limit greatest(1, least(match_count, 20));
$$;

revoke all on function public.match_rag_chunks(extensions.vector, text, integer)
  from public, anon, authenticated;
grant execute on function public.match_rag_chunks(extensions.vector, text, integer)
  to service_role;

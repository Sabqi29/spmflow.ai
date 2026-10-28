-- One-off data job: suggest a textbook chapter and page for every question by keyword search over rag_chunks.
-- Suggestions are stored unverified (never shown as page references until someone verifies them), and the
-- question's chapter tag is set only when most of the top matches agree on one chapter.
-- Safe to re-run: it replaces earlier unverified AI suggestions and leaves verified rows alone.

create temp table question_terms as
select q.id, string_agg(distinct w, ' | ') as query
from public.questions q
cross join lateral regexp_split_to_table(lower(q.stem || ' ' || coalesce((select string_agg(v, ' ') from jsonb_each_text(q.options) e(k, v) where k in ('A','B','C','D','I','II','III','IV')), '')), '[^[:alnum:]]+') w
where length(w) > 4 and w not in (
  'apakah','manakah','mengapakah','bagaimanakah','berikut','tersebut','antara','dengan','kepada','dalam','adalah',
  'untuk','telah','kerana','semasa','selepas','sebelum','ialah','iaitu','tentang','pernyataan','situasi','maklumat',
  'menunjukkan','berkaitan','betul','benar','tidak','mereka','negara','tujuan','tindakan','peranan','kesan','faktor')
group by q.id;

create temp table question_matches as
select t.id as question_id, c.id as chunk_id, (regexp_replace(c.form, '\D', '', 'g'))::smallint as form_level, c.chapter_id,
  c.current_page, c.section_title, ts_rank_cd(c.search_document, to_tsquery('simple', t.query)) as rank,
  row_number() over (partition by t.id order by ts_rank_cd(c.search_document, to_tsquery('simple', t.query)) desc, c.id) as n
from question_terms t
join public.rag_chunks c on c.search_document @@ to_tsquery('simple', t.query);

create temp table question_chapter as
select distinct on (question_id) question_id, form_level, chapter_id,
  sum(rank) over (partition by question_id, form_level, chapter_id) / nullif(sum(rank) over (partition by question_id), 0) as share
from question_matches where n <= 5
order by question_id, share desc, form_level, chapter_id;

delete from public.question_references where mapping_source = 'ai' and not verified;

insert into public.question_references(question_id, textbook_id, rag_chunk_id, chapter_id, printed_page, section_title, confidence, mapping_source)
select ch.question_id, 'sejarah-t' || ch.form_level, m.chunk_id, ch.chapter_id, m.current_page, coalesce(m.section_title, ''), round(ch.share::numeric, 2), 'ai'
from question_chapter ch
join lateral (
  select chunk_id, current_page, section_title from question_matches m
  where m.question_id = ch.question_id and m.form_level = ch.form_level and m.chapter_id = ch.chapter_id
  order by rank desc limit 1
) m on true
where not exists (select 1 from public.question_references r where r.question_id = ch.question_id and r.verified);

update public.questions q set form_level = ch.form_level, chapter_id = ch.chapter_id
from question_chapter ch where ch.question_id = q.id and ch.share >= 0.5;
drop table question_terms, question_matches, question_chapter;

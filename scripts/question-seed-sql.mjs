// Prints SQL that loads the Paper 1 bank (credit: khayyum04/studyflow_v2) into question_sets/questions.
// Usage: node scripts/question-seed-sql.mjs [chunkIndex chunkSize] > seed.sql
import {readFileSync} from 'node:fs';
const root=new URL('../src/data/',import.meta.url);
const questions=JSON.parse(readFileSync(new URL('paper_1_dataset.json',root),'utf8'));
const catalog=JSON.parse(readFileSync(new URL('question-set-catalog.json',root),'utf8'));
const [chunk,size]=process.argv.slice(2).map(Number);
const lit=value=>{const json=JSON.stringify(value);if(json.includes('$q$'))throw new Error('delimiter clash');return `$q$${json}$q$::jsonb`};
const out=[];
if(!size||chunk===0){
 const states=new Map(questions.map(q=>[q.source.paper_key,q.source.state]));
 const sets=catalog.map(s=>({id:s.id,year:s.year,title:s.title,paper:s.paper,state:states.get(s.id)||'',question_count:s.questions,source_url:s.sourceUrl||''}));
 out.push(`insert into public.question_sets(id,year,title,paper,state,question_count,source_url)
select id,year,title,paper,state,question_count,source_url from jsonb_to_recordset(${lit(sets)}) as x(id text,year int,title text,paper text,state text,question_count int,source_url text)
on conflict (id) do update set year=excluded.year,title=excluded.title,paper=excluded.paper,state=excluded.state,question_count=excluded.question_count,source_url=excluded.source_url;`);
}
const rows=questions.map(q=>({id:q.id,set_id:q.source.paper_key,question_number:q.question_number,stem:q.question,options:q.options,answer:q.answer}));
const part=size?rows.slice(chunk*size,(chunk+1)*size):rows;
if(part.length)out.push(`insert into public.questions(id,set_id,question_number,stem,options,answer)
select id,set_id,question_number,stem,options,answer from jsonb_to_recordset(${lit(part)}) as x(id text,set_id text,question_number int,stem text,options jsonb,answer text)
on conflict (id) do update set set_id=excluded.set_id,question_number=excluded.question_number,stem=excluded.stem,options=excluded.options,answer=excluded.answer;`);
process.stdout.write(out.join('\n')+'\n');

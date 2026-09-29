import {readFile,writeFile} from 'node:fs/promises';

const sourceUrl='https://github.com/khayyum04/studyflow_v2/blob/main/data/paper_1_dataset.json';
const input=new URL('../src/data/paper_1_dataset.json',import.meta.url);
const output=new URL('../src/data/question-set-catalog.json',import.meta.url);
const questions=JSON.parse(await readFile(input,'utf8'));
const sets=new Map();

for(const question of questions){
 const key=question.source.paper_key;
 const current=sets.get(key)??{
  id:key,
  year:question.source.year,
  title:question.source.district||question.source.state||key,
  paper:question.source.paper,
  questions:0,
  sourceUrl
 };
 current.questions+=1;
 sets.set(key,current);
}

await writeFile(output,`${JSON.stringify([...sets.values()].sort((a,b)=>b.year-a.year||a.title.localeCompare(b.title)),null,2)}\n`);
console.log(`Wrote ${sets.size} question sets from ${questions.length} questions.`);

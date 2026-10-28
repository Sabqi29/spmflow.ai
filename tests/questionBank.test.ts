import {describe,expect,it} from 'vitest';
import dataset from '../src/data/paper_1_dataset.json';
import catalog from '../src/data/question-set-catalog.json';
import {splitOptions} from '../src/lib/questionBank';

type Q={id:string;source:{paper_key:string};question_number:number;question:string;options:Record<string,string>;answer:string};
const questions=dataset as Q[];
const sets=catalog as {id:string;questions:number}[];

describe('question bank',()=>{
 it('has 2,560 questions in 68 sets',()=>{
  expect(questions).toHaveLength(2560);
  expect(sets).toHaveLength(68);
 });
 it('has unique question ids',()=>expect(new Set(questions.map(q=>q.id)).size).toBe(questions.length));
 it('gives every question four options and an answer among them',()=>{
  for(const q of questions){
   expect(splitOptions(q.options).choices.map(([key])=>key),q.id).toEqual(['A','B','C','D']);
   expect(['A','B','C','D'],q.id).toContain(q.answer);
   expect(q.question.trim().length,q.id).toBeGreaterThan(0);
  }
 });
 it('matches each catalog count to the dataset',()=>{
  const counts=new Map<string,number>();for(const q of questions)counts.set(q.source.paper_key,(counts.get(q.source.paper_key)||0)+1);
  for(const set of sets)expect(counts.get(set.id),set.id).toBe(set.questions);
 });
});

describe('splitOptions',()=>{
 it('separates I–IV statements from the A–D choices',()=>{
  const {choices,statements}=splitOptions({I:'satu',A:'I dan II',II:'dua',B:'I dan III',C:'II dan IV',D:'III dan IV'});
  expect(choices.map(([key])=>key)).toEqual(['A','B','C','D']);
  expect(statements).toEqual([['I','satu'],['II','dua']]);
 });
 it('never offers a statement as a clickable choice anywhere in the bank',()=>{
  for(const q of questions)expect(splitOptions(q.options).choices).toHaveLength(4);
 });
});

import {describe,expect,it} from 'vitest';
import {ChapterStat,focusChapters} from '../src/lib/guide';

const row=(form_level:number,chapter_id:number,answered:number,accuracy:number|null):ChapterStat=>({form_level,chapter_id,chapter_title:`Bab ${chapter_id}`,page_start:1,answered,correct:0,accuracy});

describe('focusChapters',()=>{
 it('puts the weakest tried chapters first',()=>{
  const out=focusChapters([row(4,1,10,90),row(4,2,10,40),row(4,3,6,60),row(4,4,0,null)]);
  expect(out.map(r=>r.chapter_id)).toEqual([2,3,4]);
 });
 it('ignores chapters with too few answers to judge',()=>{
  expect(focusChapters([row(4,1,2,0),row(4,2,0,null)]).map(r=>r.chapter_id)).toEqual([2]);
 });
 it('skips chapters that are already strong',()=>{
  expect(focusChapters([row(5,1,20,95)])).toEqual([]);
 });
 it('fills with untried chapters in textbook order',()=>{
  expect(focusChapters([row(5,2,0,null),row(4,7,0,null),row(4,3,0,null)],2).map(r=>`${r.form_level}-${r.chapter_id}`)).toEqual(['4-3','4-7']);
 });
});

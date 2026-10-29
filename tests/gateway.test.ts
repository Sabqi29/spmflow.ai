import {describe,expect,it} from 'vitest';
import {cacheKey,estimateCost,googleBackupAllowed,isCacheable,keywords,mayUseWeb,normalizeQuestion,outOfSyllabus,parseTask,readWikiAnswer,scrubPersonalInfo,termCoverage,usableWikiPages,wikiSearchTerms} from '../supabase/functions/spmflow-ask/gateway';

describe('AI gateway helpers',()=>{
 it('routes known task types and defaults safely',()=>{
  expect(parseTask('hint',false)).toBe('hint');
  expect(parseTask('essay_marking',false)).toBe('ask');
  expect(parseTask(undefined,true)).toBe('explain_wrong_answer');
 });

 it('removes IC numbers, phone numbers and emails',()=>{
  const text=scrubPersonalInfo('Saya Ali, IC 080512-10-1234 atau 080512101234, telefon 012-345 6789 / +60123456789, emel ali.k@sekolah.edu.my. Apakah maksud nasionalisme?');
  expect(text).not.toMatch(/080512|345 6789|123456789|ali\.k@/);
  expect(text).toContain('[no. IC]');
  expect(text).toContain('[no. telefon]');
  expect(text).toContain('[emel]');
  expect(text).toContain('Apakah maksud nasionalisme?');
 });

 it('keeps years and page numbers intact',()=>{
  expect(scrubPersonalInfo('Perjanjian Pangkor 1874, muka surat 22')).toBe('Perjanjian Pangkor 1874, muka surat 22');
 });

 it('shares cache keys across case, spacing and punctuation only',async()=>{
  expect(normalizeQuestion('  Apakah MAKSUD   nasionalisme?? ')).toBe('apakah maksud nasionalisme');
  const a=await cacheKey('ask',4,'Apakah maksud nasionalisme?','m');
  expect(await cacheKey('ask',4,'apakah maksud nasionalisme','m')).toBe(a);
  expect(await cacheKey('ask',5,'apakah maksud nasionalisme','m')).not.toBe(a);
  expect(await cacheKey('hint',4,'apakah maksud nasionalisme','m')).not.toBe(a);
 });

 it('never caches personal practice questions',()=>{
  expect(isCacheable('ask',false)).toBe(true);
  expect(isCacheable('ask',true)).toBe(false);
  expect(isCacheable('hint',false)).toBe(false);
 });

 it('estimates cost from tokens',()=>{
  expect(estimateCost(1_000_000,0)).toBeCloseTo(0.1);
  expect(estimateCost(1000,500)).toBeCloseTo(0.0003);
  expect(estimateCost(null,null)).toBe(0);
 });
});

describe('textbook-first routing',()=>{
 it('ignores question words and textbook-wide words when measuring coverage',()=>{
  expect(keywords('Siapakah presiden pertama Amerika?')).toEqual(['presiden','pertama','amerika']);
  const chunk={chapter_title:'Nasionalisme',section_title:'Maksud',content:'Nasionalisme ditakrifkan sebagai semangat cinta akan tanah air.'};
  expect(termCoverage('Apakah maksud nasionalisme?',chunk)).toBe(1);
  expect(termCoverage('Siapakah presiden pertama Amerika?',chunk)).toBe(0);
  expect(termCoverage('Sejarah Malaysia nasionalisme iPhone',chunk)).toBe(0.5);
 });

 it('only lets plain questions use the internet, and only when switched on',()=>{
  expect(mayUseWeb('ask',false,true)).toBe(true);
  expect(mayUseWeb('ask',false,false)).toBe(false);
  expect(mayUseWeb('ask',true,true)).toBe(false);
  expect(mayUseWeb('hint',false,true)).toBe(false);
  expect(mayUseWeb('explain_wrong_answer',false,true)).toBe(false);
 });

 it('names the form in the out-of-syllabus reply',()=>{
  expect(outOfSyllabus(5)).toContain('Tingkatan 5');
 });
});

describe('Wikipedia fallback', () => {
  const long = 'Apple Inc. ialah syarikat teknologi Amerika yang mereka bentuk iPhone. '.repeat(4);
  it('searches Wikipedia with the question keywords', () => {
    expect(wikiSearchTerms('Siapakah pencipta iPhone?')).toBe('pencipta iphone');
  });
  it('keeps only real Wikipedia pages with enough text, once each', () => {
    const pages = usableWikiPages([
      { title: 'iPhone', url: 'https://ms.wikipedia.org/wiki/IPhone', extract: long },
      { title: 'iPhone', url: 'https://ms.wikipedia.org/wiki/IPhone', extract: long },
      { title: 'Pendek', url: 'https://ms.wikipedia.org/wiki/Pendek', extract: 'terlalu pendek' },
      { title: 'Palsu', url: 'https://evil.example/wiki/IPhone', extract: long },
      { title: 'iPhone', url: 'https://en.wikipedia.org/wiki/IPhone', extract: 'x'.repeat(5000) },
    ]);
    expect(pages.map((p) => p.url)).toEqual(['https://ms.wikipedia.org/wiki/IPhone', 'https://en.wikipedia.org/wiki/IPhone']);
    expect(pages[1].extract.length).toBe(2500);
  });
  it('reads the cited page and treats TIADA_JAWAPAN as no answer', () => {
    expect(readWikiAnswer('iPhone dicipta oleh Apple.\nRUJUKAN: 2', 3)).toEqual({ text: 'iPhone dicipta oleh Apple.', index: 1 });
    expect(readWikiAnswer('Jawapan.\nRUJUKAN: 9', 2)?.index).toBe(1);
    expect(readWikiAnswer('Jawapan tanpa rujukan', 2)?.index).toBe(0);
    expect(readWikiAnswer('TIADA_JAWAPAN', 2)).toBeNull();
  });
  it('caps the paid Google backup per day', () => {
    expect(googleBackupAllowed(10, 50)).toBe(true);
    expect(googleBackupAllowed(50, 50)).toBe(false);
    expect(googleBackupAllowed(0, 0)).toBe(false);
    expect(googleBackupAllowed(null, 50)).toBe(false);
  });
});

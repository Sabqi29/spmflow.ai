import {describe,expect,it} from 'vitest';
import {cacheKey,estimateCost,isCacheable,normalizeQuestion,parseTask,scrubPersonalInfo} from '../supabase/functions/spmflow-ask/gateway';

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

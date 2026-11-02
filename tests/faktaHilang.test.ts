import {describe,expect,it} from 'vitest';
import {FACT_PUZZLES} from '../src/data/faktaHilang';
import {closeness,compact,judge,matchedPositions,normalize,puzzleForDay,summarize} from '../src/lib/faktaHilang';
import {dayIndex,myDay} from '../src/lib/daily';

const baling=FACT_PUZZLES.find(p=>p.id==='t4-baling')!;
const kotaBharu=FACT_PUZZLES.find(p=>p.id==='t4-kota-bharu')!;

describe('Fakta Hilang data',()=>{
 it('has one blank, a page and an answer in every puzzle',()=>{
  for(const p of FACT_PUZZLES){
   expect(p.text.split('___').length,p.id).toBe(2);
   expect(p.answers.length,p.id).toBeGreaterThan(0);
   expect(p.page,p.id).toBeGreaterThan(0);
   expect(p.chapter,p.id).toBeGreaterThanOrEqual(1);
   expect(p.chapter,p.id).toBeLessThanOrEqual(10);
   expect(p.clue.length,p.id).toBeGreaterThan(5);
   expect(compact(p.clue).includes(compact(p.answers[0])),p.id+' clue gives the answer away').toBe(false);
  }
 });
 it('uses unique ids',()=>{expect(new Set(FACT_PUZZLES.map(p=>p.id)).size).toBe(FACT_PUZZLES.length)});
});

describe('daily rollover',()=>{
 it('follows Malaysia time',()=>{
  expect(myDay(new Date('2026-11-02T15:59:00Z'))).toBe('2026-11-02');
  expect(myDay(new Date('2026-11-02T16:00:00Z'))).toBe('2026-11-03');
 });
 it('numbers puzzles from the epoch and cycles',()=>{
  expect(puzzleForDay('2026-11-03').number).toBe(1);
  expect(puzzleForDay('2026-11-03').puzzle).toBe(FACT_PUZZLES[0]);
  expect(puzzleForDay('2026-11-04').puzzle).toBe(FACT_PUZZLES[1]);
  const later=new Date(Date.parse('2026-11-03T00:00:00Z')+FACT_PUZZLES.length*864e5).toISOString().slice(0,10);
  expect(puzzleForDay(later).puzzle).toBe(FACT_PUZZLES[0]);
  expect(puzzleForDay('2026-11-01').puzzle).toBe(FACT_PUZZLES[FACT_PUZZLES.length-2]);
  expect(dayIndex('2026-11-03','2027-01-01')).toBe(59);
 });
});

describe('judging guesses',()=>{
 it('ignores case, spaces and punctuation',()=>{
  expect(normalize("  Dato' Onn ")).toBe('dato onn');
  expect(judge('baling',baling)).toBe('right');
  expect(judge('KOTA-BHARU',kotaBharu)).toBe('right');
  expect(judge('kotabaru',kotaBharu)).toBe('right');
 });
 it('forgives one wrong letter in long words but never in numbers',()=>{
  expect(judge('Hiroshma',FACT_PUZZLES.find(p=>p.id==='t4-hiroshima')!)).toBe('typo');
  expect(judge('Batang',baling)).toBe('wrong');
  expect(judge('1945',FACT_PUZZLES.find(p=>p.id==='t4-umno-1946')!)).toBe('wrong');
  expect(judge('',baling)).toBe('wrong');
 });
 it('reveals letters in the right place',()=>{
  expect(matchedPositions('Batang','Baling')).toEqual([0,1,4,5]);
  expect(matchedPositions('Kota Baru','Kota Bharu')).toEqual([0,1,2,3,4]);
 });
 it('says how close a guess is',()=>{
  expect(closeness('1948','1946')).toEqual({level:'close',direction:'earlier'});
  expect(closeness('1935','1946')).toEqual({level:'near',direction:'later'});
  expect(closeness('1900','1946').level).toBe('far');
  expect(closeness('Balang','Baling').level).toBe('close');
  expect(closeness('Johor','Baling').level).toBe('far');
 });
});

describe('stats',()=>{
 it('counts streaks, best run and the guess distribution',()=>{
  const s=summarize({
   '2026-11-03':{guesses:['a'],status:'won'},
   '2026-11-04':{guesses:['a','b','c','d','e'],status:'lost'},
   '2026-11-05':{guesses:['a','b'],status:'won'},
   '2026-11-06':{guesses:['a','b'],status:'won'},
   '2026-11-07':{guesses:['a'],status:'play'}
  },'2026-11-07');
  expect(s).toEqual({played:4,won:3,streak:2,best:2,dist:[1,2,0,0,0]});
 });
 it('breaks the streak after a missed day',()=>{
  expect(summarize({'2026-11-03':{guesses:['a'],status:'won'}},'2026-11-05').streak).toBe(0);
 });
});

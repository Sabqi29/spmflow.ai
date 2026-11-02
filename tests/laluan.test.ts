import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
// @ts-expect-error plain JS build script
import {before,buildPuzzles,parseEvents} from '../scripts/build-laluan.mjs';
import data from '../src/data/laluan.json';
import {formatEventDate,formatTime,pathSolves,puzzleFor,puzzleIndex,tryStep} from '../src/lib/laluan';

const source=readFileSync(new URL('../data/chronology/kronologi.txt',import.meta.url),'utf8');
type Ev={id:string;d:string;l:string};

describe('Laluan Masa data',()=>{
 it('is up to date with data/chronology/kronologi.txt',()=>{
  const events=parseEvents(source);
  expect(data.events).toEqual(events);
  expect(data.puzzles).toEqual(buildPuzzles(events));
 });
 it('covers every Sejarah chapter that has dated events',()=>{
  const chapters=new Set(data.events.map(e=>`${e.f}-${e.b}`));
  expect(chapters.size).toBe(19);
  expect(data.events.length).toBeGreaterThan(400);
 });
 it('only puts events with a certain order in one puzzle, earliest first',()=>{
  const byId=new Map((data.events as Ev[]).map(e=>[e.id,e]));
  for(const p of data.puzzles){
   const evs=p.ev.map(id=>byId.get(id)!);
   evs.slice(1).forEach((e,i)=>expect(before(evs[i],e),`${evs[i].id} before ${e.id}`).toBe(true));
   expect(new Set(evs.map(e=>e.l)).size).toBe(evs.length);
  }
 });
 it('has checkpoints on distinct cells, one per event',()=>{
  for(const p of data.puzzles){
   expect(p.cp.length).toBe(p.ev.length);
   expect(new Set(p.cp).size).toBe(p.cp.length);
   expect(p.cp.every(c=>c>=0&&c<p.n*p.n)).toBe(true);
   expect(new Set(p.tag).size).toBe(p.cp.length);
  }
 });
 it('matches the seed migration the server checks paths against',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261103010100_chrono_puzzles_seed.sql',import.meta.url),'utf8');
  const rows=[...sql.matchAll(/^\((\d+),(\d+),'\{([\d,]+)\}'\)/gm)].map(m=>({i:+m[1],n:+m[2],cp:m[3].split(',').map(Number)}));
  expect(rows.length).toBe(data.puzzles.length);
  rows.forEach(r=>expect({n:r.n,cp:r.cp}).toEqual({n:data.puzzles[r.i].n,cp:data.puzzles[r.i].cp}));
 });
 it('rolls over daily from the epoch and cycles',()=>{
  expect(puzzleFor('2026-11-03').number).toBe(1);
  expect(puzzleIndex('2026-11-04')).toBe(1);
  expect(puzzleIndex('2026-11-02')).toBe(data.puzzles.length-1);
  expect(puzzleIndex('2028-11-02')).toBe(0);
 });
});

describe('drawing rules',()=>{
 // 4x4: snake 0 1 2 3 7 6 5 4 8 9 10 11 15 14 13 12, checkpoints 0 -> 6 -> 9 -> 12
 const cp=[0,6,9,12];const snake=[0,1,2,3,7,6,5,4,8,9,10,11,15,14,13,12];
 it('must start on the earliest event',()=>{
  expect(tryStep(4,cp,[],0)).toEqual({kind:'start'});
  expect(tryStep(4,cp,[],9)).toEqual({kind:'wrong',checkpoint:2});
  expect(tryStep(4,cp,[],5)).toEqual({kind:'blocked',reason:'start'});
 });
 it('moves one cell at a time and steps back to undo',()=>{
  expect(tryStep(4,cp,[0],1)).toEqual({kind:'add'});
  expect(tryStep(4,cp,[0],5)).toEqual({kind:'blocked',reason:'far'});
  expect(tryStep(4,cp,[0,1],0)).toEqual({kind:'back'});
  expect(tryStep(4,cp,[0,1,5,4],0)).toEqual({kind:'blocked',reason:'visited'});
 });
 it('does not wrap around rows',()=>expect(tryStep(4,cp,[0,1,2,3],4)).toEqual({kind:'blocked',reason:'far'}));
 it('counts an out-of-order event as a wrong join',()=>expect(tryStep(4,[0,6,2,12],[0,1],2)).toEqual({kind:'wrong',checkpoint:2}));
 it('keeps the last event for the final cell',()=>expect(tryStep(4,[0,1],[0],1)).toEqual({kind:'blocked',reason:'finish'}));
 it('accepts the full path, like the server',()=>{
  expect(pathSolves(4,cp,snake)).toBe(true);
  expect(pathSolves(4,cp,snake.slice(0,-1))).toBe(false);
  expect(pathSolves(4,[0,9,6,12],snake)).toBe(false);
 });
});

describe('formatting',()=>{
 it('writes dates in Malay and English',()=>{
  expect(formatEventDate('1914-07-28')).toBe('28 Julai 1914');
  expect(formatEventDate('1945-09')).toBe('September 1945');
  expect(formatEventDate('1957')).toBe('1957');
  expect(formatEventDate('1957-08-31',true)).toBe('August 31, 1957');
 });
 it('shows minutes, seconds and tenths',()=>{
  expect(formatTime(83400)).toBe('1:23.4');
  expect(formatTime(5000)).toBe('0:05.0');
 });
});

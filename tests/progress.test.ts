import {describe,expect,it} from 'vitest';
import {calculateStreak,dueIn,greeting,summarize} from '../src/lib/progress';

const now=new Date(2026,9,28,12);
const at=(daysAgo:number)=>new Date(2026,9,28-daysAgo,9).toISOString();

describe('calculateStreak',()=>{
 it('is 0 with no results',()=>expect(calculateStreak([],now)).toBe(0));
 it('counts consecutive days including today',()=>expect(calculateStreak([at(0),at(1),at(2),at(4)].map(created_at=>({score:1,total:1,created_at})),now)).toBe(3));
 it('keeps yesterday’s streak alive before practising today',()=>expect(calculateStreak([at(1),at(2)].map(created_at=>({score:1,total:1,created_at})),now)).toBe(2));
 it('breaks after a missed day',()=>expect(calculateStreak([at(2),at(3)].map(created_at=>({score:1,total:1,created_at})),now)).toBe(0));
 it('counts several results on one day once',()=>expect(calculateStreak([at(0),at(0),at(0)].map(created_at=>({score:1,total:1,created_at})),now)).toBe(1));
});

describe('summarize',()=>{
 it('totals answers and rounds accuracy',()=>{
  const s=summarize([{score:7,total:10,created_at:at(0)},{score:1,total:2,created_at:at(1)}],now);
  expect(s).toEqual({answered:12,correct:8,accuracy:67,streak:2,sessions:2});
 });
 it('has 0% accuracy with nothing answered',()=>expect(summarize([],now).accuracy).toBe(0));
});

describe('greeting',()=>{
 it('follows the time of day in BM',()=>{
  expect(greeting(8,'bm')).toBe('Selamat pagi');
  expect(greeting(13,'bm')).toBe('Selamat tengah hari');
  expect(greeting(17,'bm')).toBe('Selamat petang');
  expect(greeting(21,'bm')).toBe('Selamat malam');
 });
 it('has English versions',()=>expect(greeting(8,'en')).toBe('Good morning'));
});

describe('dueIn',()=>{
 it('handles no due date',()=>expect(dueIn(null,now)).toEqual({days:null,overdue:false}));
 it('counts days left',()=>expect(dueIn(new Date(2026,9,31,12).toISOString(),now)).toEqual({days:3,overdue:false}));
 it('flags overdue work',()=>expect(dueIn(new Date(2026,9,27,12).toISOString(),now).overdue).toBe(true));
});

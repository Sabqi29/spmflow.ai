import {dayIndex,previousDay} from './daily';
import {FACT_EPOCH,FACT_PUZZLES,type FactPuzzle} from '../data/faktaHilang';

export const MAX_TRIES=5;

/** Lower-case, strip accents and punctuation, collapse spaces. "Dato' Onn" → "dato onn". */
export function normalize(text:string):string{
 return text.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/['’`.-]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
}
export const compact=(text:string)=>normalize(text).replace(/ /g,'');

export function puzzleForDay(day:string,list:FactPuzzle[]=FACT_PUZZLES){
 const index=dayIndex(FACT_EPOCH,day),n=list.length;
 return {puzzle:list[((index%n)+n)%n],number:index+1};
}

export function levenshtein(a:string,b:string):number{
 let prev=Array.from({length:b.length+1},(_,j)=>j);
 for(let i=1;i<=a.length;i++){const row=[i];
  for(let j=1;j<=b.length;j++)row[j]=Math.min(prev[j]+1,row[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
  prev=row}
 return prev[b.length];
}

export type Verdict='right'|'typo'|'wrong';
/** 'typo' is a near-miss on a long word (one letter off), which still counts as solved. */
export function judge(guess:string,puzzle:FactPuzzle):Verdict{
 const g=compact(guess);if(!g)return 'wrong';
 const keys=puzzle.answers.map(compact);
 if(keys.includes(g))return 'right';
 if(!/^\d+$/.test(g)&&keys.some(k=>k.length>=6&&levenshtein(g,k)<=1))return 'typo';
 return 'wrong';
}

/** Positions (in the answer without spaces) where the guess has the same letter. */
export function matchedPositions(guess:string,answer:string):number[]{
 const g=compact(guess),a=compact(answer),out:number[]=[];
 for(let i=0;i<a.length;i++)if(g[i]===a[i])out.push(i);
 return out;
}

export type Closeness={level:'far'|'near'|'close';direction?:'later'|'earlier'};
/** How close a wrong guess is. Numbers compare by value (and say which way to go); words by spelling. */
export function closeness(guess:string,answer:string):Closeness{
 const g=compact(guess),a=compact(answer);
 if(/^\d+$/.test(a)&&/^\d+$/.test(g)){const diff=Number(a)-Number(g),gap=Math.abs(diff);
  return {level:gap<=3?'close':gap<=15?'near':'far',direction:diff>0?'later':'earlier'}}
 const score=1-levenshtein(g,a)/Math.max(g.length,a.length,1);
 return {level:score>=0.7?'close':score>=0.4?'near':'far'};
}

export type DayRecord={guesses:string[];status:'play'|'won'|'lost'};
export type History=Record<string,DayRecord>;

export function summarize(history:History,today:string){
 const done=Object.entries(history).filter(([,r])=>r.status!=='play');
 const won=done.filter(([,r])=>r.status==='won');
 const dist=Array.from({length:MAX_TRIES},()=>0);
 for(const [,r] of won)if(r.guesses.length>=1&&r.guesses.length<=MAX_TRIES)dist[r.guesses.length-1]++;
 let streak=0,day=history[today]?.status==='won'?today:previousDay(today);
 while(history[day]?.status==='won'){streak++;day=previousDay(day)}
 let best=0,run=0;
 for(const d of Object.keys(history).sort()){if(history[d].status==='won'){run=d&&history[previousDay(d)]?.status==='won'?run+1:1;best=Math.max(best,run)}else if(history[d].status==='lost')run=0}
 return {played:done.length,won:won.length,streak,best,dist};
}

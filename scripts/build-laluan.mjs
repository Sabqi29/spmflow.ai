// Builds the daily "Laluan Masa" puzzles from data/chronology/kronologi.txt.
// Writes src/data/laluan.json (events + puzzles for the app) and the puzzle seed SQL that
// the chrono_path migration needs (so the server can check a solved path).
// Usage: node scripts/build-laluan.mjs   (writes src/data/laluan.json and the seed migration)
// The output is deterministic: the same source file always gives the same puzzles.
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const DAYS=730;          // puzzles before the cycle repeats
export const EPOCH='2026-11-03'; // puzzle #1

function mulberry32(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const shuffle=(a,r)=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};

export function parseEvents(text){
 const events=[];let form=0,chapter=0;const seen=new Set();
 for(const [n,raw] of text.split('\n').entries()){
  const line=raw.trim();
  const head=/^#T([45])B(\d+)$/.exec(line);
  if(head){form=+head[1];chapter=+head[2];continue}
  if(!line||line.startsWith('#'))continue;
  const [date,page,label,...rest]=line.split('|');
  if(rest.length||!label||!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(date)||!/^\d+$/.test(page)||!form)throw new Error(`kronologi.txt line ${n+1}: ${line}`);
  const key=`${form}-${chapter}-${date}-${label}`;if(seen.has(key))throw new Error(`duplicate on line ${n+1}`);seen.add(key);
  events.push({id:'',f:form,b:chapter,p:+page,d:date,l:label.trim()});
 }
 const count={};
 for(const e of events){const k=`t${e.f}b${e.b}`;count[k]=(count[k]||0)+1;e.id=`${k}-${String(count[k]).padStart(2,'0')}`}
 return events;
}

/* Two events can share a puzzle only if their order is certain: different years, or the same
   year with months that differ, or the same month with different days. */
export function before(a,b){
 const pa=a.d.split('-').map(Number),pb=b.d.split('-').map(Number);
 for(let i=0;i<3;i++){
  if(pa[i]===undefined||pb[i]===undefined)return null;
  if(pa[i]!==pb[i])return pa[i]<pb[i];
 }
 return null;
}

function pickEvents(pool,k,r){
 for(let attempt=0;attempt<200;attempt++){
  const picked=[];
  for(const e of shuffle([...pool],r)){
   if(picked.every(p=>before(p,e)!==null&&p.l!==e.l))picked.push(e);
   if(picked.length===k)break;
  }
  if(picked.length===k)return picked.sort((a,b)=>before(a,b)?-1:1);
 }
 return null;
}

/* A random path through every cell of an n×n grid: start from a snake and apply "backbite"
   moves, which keep it a Hamiltonian path while mixing it thoroughly. */
export function randomPath(n,r){
 let path=[];for(let y=0;y<n;y++)for(let x=0;x<n;x++)path.push(y*n+(y%2?n-1-x:x));
 const near=c=>{const x=c%n,y=Math.floor(c/n),o=[];if(x>0)o.push(c-1);if(x<n-1)o.push(c+1);if(y>0)o.push(c-n);if(y<n-1)o.push(c+n);return o};
 for(let step=0;step<n*n*60;step++){
  if(r()<0.5)path.reverse();
  const end=path[path.length-1];const opts=near(end).filter(c=>c!==path[path.length-2]);
  const pick=opts[Math.floor(r()*opts.length)];const i=path.indexOf(pick);
  path=[...path.slice(0,i+1),...path.slice(i+1).reverse()];
 }
 return path;
}

export function buildPuzzles(events){
 const chapters=[...new Set(events.map(e=>`t${e.f}b${e.b}`))].filter(k=>{
  const pool=events.filter(e=>`t${e.f}b${e.b}`===k);return pickEvents(pool,6,mulberry32(1))!==null});
 const puzzles=[];let order=[];
 for(let day=0;day<DAYS;day++){
  const r=mulberry32(0x5eed+day*7919);
  const weekday=new Date(Date.parse(EPOCH+'T00:00:00Z')+day*86400000).getUTCDay();
  const weekend=weekday===0||weekday===6;
  const n=weekend?7:6,k=weekend?8:6;
  if(!order.length)order=shuffle([...chapters],r);
  let key=order.shift(),pool=events.filter(e=>`t${e.f}b${e.b}`===key),picked=pickEvents(pool,k,r);
  if(!picked){ // too few events in this chapter for a big puzzle: use the whole form instead
   pool=events.filter(e=>e.f===+key[1]);picked=pickEvents(pool,k,r);key=`t${key[1]}`;
  }
  const path=randomPath(n,r);
  // Spread the checkpoints along the path: first and last cell, the rest evenly with a little jitter.
  const gap=(n*n-1)/(k-1);const at=[0];
  for(let i=1;i<k-1;i++)at.push(Math.round(i*gap+(r()-0.5)*gap*0.5));
  at.push(n*n-1);
  if(at.some((v,i)=>i>0&&v<=at[i-1]))throw new Error(`day ${day}: checkpoints collide`);
  const letters=shuffle('ABCDEFGH'.slice(0,k).split(''),r);
  puzzles.push({n,scope:key,cp:at.map(i=>path[i]),ev:picked.map(e=>e.id),tag:letters.join('')});
 }
 return puzzles;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const events=parseEvents(readFileSync(resolve(root,'data/chronology/kronologi.txt'),'utf8'));
 const puzzles=buildPuzzles(events);
 writeFileSync(resolve(root,'src/data/laluan.json'),JSON.stringify({epoch:EPOCH,events,puzzles}));
 const rows=puzzles.map((p,i)=>`(${i},${p.n},'{${p.cp.join(',')}}')`);
 const sql=`-- Laluan Masa puzzle seed: grid size and checkpoint cells (in chronological order) for each day.\n-- Generated by scripts/build-laluan.mjs from data/chronology/kronologi.txt. Do not edit by hand.\ninsert into public.chrono_puzzles(day_index, grid_size, checkpoints) values\n${rows.join(',\n')}\non conflict (day_index) do update set grid_size = excluded.grid_size, checkpoints = excluded.checkpoints;\n`;
 writeFileSync(resolve(root,'supabase/migrations/20261103010100_chrono_puzzles_seed.sql'),sql);
 const used=new Set(puzzles.flatMap(p=>p.ev));
 console.log(`${events.length} events, ${puzzles.length} puzzles, ${used.size} events used`);
}

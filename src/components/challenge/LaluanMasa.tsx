import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {BookOpen,Check,Clock,Copy,Crown,Play,RotateCcw,Route,Trophy,Undo2,X} from 'lucide-react';
import {supabase} from '../../lib/api';
import {useApp} from '../../lib/context';
import {myDay,previousDay} from '../../lib/daily';
import {sejarahChapters} from '../../lib/curriculum';
import {PENALTY_MS,formatEventDate,formatTime,pathSolves,puzzleFor,puzzleIndex,tryStep,type DailyPuzzle} from '../../lib/laluan';
import type {GameProps} from './ChallengeHub';
import '../../laluan.css';

type Phase='intro'|'play'|'done';
type Run={id:string;startedAt:number;finished:boolean;durationMs:number|null;mistakes:number};
type Leader={rank:number;display_name:string;school_name:string;duration_ms:number;mistakes:number;is_me:boolean;players:number};
type Result={ms:number;mistakes:number;rank?:number;players?:number;ranked:boolean};
const GUEST_KEY='spmflow-laluan-guest';

function readGuest(day:string):Result|null{try{const v=JSON.parse(localStorage.getItem(GUEST_KEY)||'null');return v?.day===day?v.result:null}catch{return null}}
function saveGuest(day:string,result:Result){try{localStorage.setItem(GUEST_KEY,JSON.stringify({day,result}))}catch{/* private mode */}}

/* Laluan Masa (Cabaran tab): each day, one grid with 6 to 8 textbook events on it. Draw one line
   through every cell, joining the events from earliest to latest. Signed-in students get one
   ranked attempt a day, timed and checked on the server; replays and guest games are unranked. */
export default function LaluanMasa({onOpenPage}:GameProps){
 const {t,lang,user,setAuthOpen,setAuthMode}=useApp();
 const en=lang==='en';
 const [day]=useState(myDay);
 const [puzzle,setPuzzle]=useState<DailyPuzzle>(()=>puzzleFor(day));
 const [phase,setPhase]=useState<Phase>('intro');
 const [run,setRun]=useState<Run|null>(null),[ranked,setRanked]=useState(false);
 const [path,setPath]=useState<number[]>([]),[mistakes,setMistakes]=useState(0);
 const [startedAt,setStartedAt]=useState(0),[now,setNow]=useState(0);
 const [flash,setFlash]=useState<{cp:number;key:number}|null>(null),[hint,setHint]=useState('');
 const [result,setResult]=useState<Result|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [boardDay,setBoardDay]=useState(day),[leaders,setLeaders]=useState<Leader[]>([]),[copied,setCopied]=useState(false);
 const grid=useRef<HTMLDivElement>(null),drawing=useRef(false);
 // Pointer moves can arrive faster than renders, so the line and mistake count live in refs too.
 const line=useRef<number[]>([]),missed=useRef(0);
 const setLine=(next:number[])=>{line.current=next;setPath(next)};

 const {n,cp}=puzzle;
 const letters=puzzle.tag.split('');
 const cpIndex=useMemo(()=>new Map(cp.map((c,i)=>[c,i])),[cp]);
 const reached=path.filter(c=>cpIndex.has(c)).length;
 const scope=puzzle.scope.length>2?(sejarahChapters[Number(puzzle.scope[1])]?.[Number(puzzle.scope.slice(3))-1]??''):'';
 const form=Number(puzzle.scope[1]);

 // Today's ranked run, if the student already started or finished one.
 useEffect(()=>{
  if(!user){setRun(null);const saved=readGuest(day);if(saved){setResult(saved);setPhase('done')}return}
  let active=true;
  supabase.from('chrono_runs').select('id,started_at,finished_at,duration_ms,mistakes,day_index').eq('play_day',day).maybeSingle().then(({data})=>{
   if(!active||!data)return;
   setPuzzle(puzzleFor(day,data.day_index));
   setRun({id:data.id,startedAt:Date.parse(data.started_at),finished:!!data.finished_at,durationMs:data.duration_ms,mistakes:data.mistakes});
   if(data.finished_at){setResult({ms:data.duration_ms??0,mistakes:data.mistakes,ranked:true});setPhase('done')}
  });
  return()=>{active=false};
 },[user,day]);

 const loadLeaders=useCallback(()=>{if(!user){setLeaders([]);return}
  supabase.rpc('get_chrono_leaderboard',{target_day:boardDay}).then(({data})=>setLeaders((data as Leader[]|null)||[]))},[user,boardDay]);
 useEffect(()=>{if(phase!=='play')loadLeaders()},[phase,loadLeaders]);

 useEffect(()=>{if(!flash)return;const id=setTimeout(()=>setFlash(null),700);return()=>clearTimeout(id)},[flash]);
 useEffect(()=>{if(phase!=='play')return;const id=setInterval(()=>setNow(Date.now()),100);return()=>clearInterval(id)},[phase]);

 async function start(asRanked:boolean){
  setError('');setLine([]);missed.current=0;setMistakes(0);setHint('');setFlash(null);
  if(asRanked&&user){
   setBusy(true);
   const {data,error}=await supabase.rpc('start_chrono');setBusy(false);
   const row=(data as {run_id:string;day_index:number;started_at:string;finished:boolean;duration_ms:number|null;mistakes:number}[]|null)?.[0];
   if(error||!row){setError(t('Cabaran tidak dapat dimulakan. Cuba lagi.','The challenge could not start. Try again.'));return}
   setPuzzle(puzzleFor(day,row.day_index));
   const r={id:row.run_id,startedAt:Date.parse(row.started_at),finished:row.finished,durationMs:row.duration_ms,mistakes:row.mistakes};setRun(r);
   if(row.finished){setResult({ms:row.duration_ms??0,mistakes:row.mistakes,ranked:true});setPhase('done');return}
   setRanked(true);setStartedAt(Math.min(Date.now(),r.startedAt));
  }else{setRanked(false);setPuzzle(puzzleFor(day,run?puzzle.index:puzzleIndex(day)));setStartedAt(Date.now())}
  setNow(Date.now());setPhase('play');
 }

 async function finish(final:number[],wrong:number){
  const localMs=Date.now()-startedAt+wrong*PENALTY_MS;
  if(ranked&&run){
   setBusy(true);
   const {data,error}=await supabase.rpc('finish_chrono',{target_run:run.id,path:final,wrong_joins:wrong});setBusy(false);
   const row=(data as {duration_ms:number;mistakes:number;rank:number;players:number}[]|null)?.[0];
   if(error||!row){setError(t('Masa anda tidak dapat direkodkan. Cuba hantar semula.','Your time could not be recorded. Try sending it again.'));return}
   setRun({...run,finished:true,durationMs:row.duration_ms,mistakes:row.mistakes});
   setResult({ms:row.duration_ms,mistakes:row.mistakes,rank:row.rank,players:row.players,ranked:true});
  }else{
   const r={ms:localMs,mistakes:wrong,ranked:false};setResult(r);if(!user&&!readGuest(day))saveGuest(day,r);
  }
  setBoardDay(day);setPhase('done');
 }

 function wrongJoin(checkpoint:number){
  missed.current+=1;setMistakes(missed.current);setFlash({cp:checkpoint,key:Date.now()});
  setHint(t(`Belum lagi. +${PENALTY_MS/1000} saat.`,`Not yet. +${PENALTY_MS/1000} seconds.`));
 }

 function step(cell:number,fromTap:boolean){
  const path=line.current;
  if(phase!=='play'||busy||(path.length===n*n))return;
  // Tapping a cell already on the line cuts the line back to it.
  if(fromTap&&path.includes(cell)&&cell!==path[path.length-1]){setLine(path.slice(0,path.indexOf(cell)+1));setHint('');return}
  const s=tryStep(n,cp,path,cell);
  if(s.kind==='start'){setLine([cell]);setHint('');return}
  if(s.kind==='back'){setLine(path.slice(0,-1));return}
  if(s.kind==='wrong'){wrongJoin(s.checkpoint);return}
  if(s.kind==='blocked'){
   if(s.reason==='start')setHint(t('Mulakan pada peristiwa yang paling awal.','Start at the earliest event.'));
   if(s.reason==='finish')setHint(t('Peristiwa terakhir mesti menjadi petak terakhir. Lalui semua petak dahulu.','The last event must be the final cell. Fill every cell first.'));
   return;
  }
  const next=[...path,cell];setLine(next);setHint('');
  if(next.length===n*n&&pathSolves(n,cp,next))void finish(next,missed.current);
 }

 function cellAt(x:number,y:number){const el=document.elementFromPoint(x,y)?.closest('[data-cell]') as HTMLElement|null;return el&&grid.current?.contains(el)?Number(el.dataset.cell):null}
 function onDown(e:React.PointerEvent){const c=cellAt(e.clientX,e.clientY);if(c===null)return;e.preventDefault();drawing.current=true;grid.current?.setPointerCapture(e.pointerId);step(c,true)}
 function onMove(e:React.PointerEvent){if(!drawing.current)return;const c=cellAt(e.clientX,e.clientY);if(c!==null&&c!==line.current[line.current.length-1])step(c,false)}
 function onUp(){drawing.current=false}
 function onKey(e:React.KeyboardEvent){
  const last=line.current[line.current.length-1];
  if(e.key==='Backspace'){e.preventDefault();setLine(line.current.slice(0,-1));return}
  const d={ArrowUp:-n,ArrowDown:n,ArrowLeft:-1,ArrowRight:1}[e.key];if(d===undefined)return;e.preventDefault();
  if(last===undefined){step(cp[0],true);return}
  const c=last+d;if(c<0||c>=n*n||(Math.abs(d)===1&&Math.floor(c/n)!==Math.floor(last/n)))return;step(c,false);
 }

 const elapsed=phase==='play'?Math.max(0,now-startedAt)+mistakes*PENALTY_MS:0;
 const points=path.map(c=>`${c%n+0.5},${Math.floor(c/n)+0.5}`).join(' ');
 function login(){setAuthMode('login');setAuthOpen(true)}
 async function copy(){if(!result)return;const text=`Laluan Masa #${puzzle.number} · ${formatTime(result.ms)}${result.mistakes?` · ${result.mistakes} ${t('silap','mistakes')}`:''} · spmflow.vercel.app`;
  try{await navigator.clipboard.writeText(text);setCopied(true);setTimeout(()=>setCopied(false),1800)}catch{/* clipboard blocked */}}

 const eventList=<ol className="laluan-events">{letters.map((letter,i)=>({letter,i})).sort((a,b)=>phase==='done'?a.i-b.i:a.letter.localeCompare(b.letter)).map(({letter,i})=>{
  const e=puzzle.events[i];const done=phase==='done'||i<reached;
  return <li key={letter} className={(done?'on ':'')+(flash?.cp===i?'shake':'')} >
   <span className="laluan-token">{letter}</span>
   <div><strong>{e.l}</strong>{phase==='done'&&<small>{formatEventDate(e.d,en)} · <button type="button" className="laluan-page" onClick={()=>onOpenPage?.(e.f,e.p)}><BookOpen size={12}/>{t(`Tingkatan ${e.f}, m/s ${e.p}`,`Form ${e.f}, p. ${e.p}`)}</button></small>}</div>
   {done&&<span className="laluan-order" aria-label={t(`Urutan ${i+1}`,`Order ${i+1}`)}>{i+1}</span>}
  </li>})}</ol>;

 const board=<section className="laluan-board" aria-label={t('Papan pendahulu','Leaderboard')}>
  <div className="laluan-board-head"><h3><Trophy size={16}/>{t('Paling laju','Fastest')}</h3>
   <div className="laluan-tabs" role="tablist">{[[day,t('Hari ini','Today')],[previousDay(day),t('Semalam','Yesterday')]].map(([d,label])=><button key={d} role="tab" aria-selected={boardDay===d} onClick={()=>setBoardDay(d)}>{label}</button>)}</div></div>
  {!user?<p className="laluan-muted">{t('Log masuk untuk merekod masa anda dan melihat papan pendahulu.','Log in to record your time and see the leaderboard.')} <button className="text-button" onClick={login}>{t('Log masuk','Log in')}</button></p>
  :leaders.length?<><ol className="laluan-leaders">{leaders.map(l=><li key={`${l.rank}-${l.display_name}-${l.is_me}`} className={l.is_me?'me':''}>
    <span className="rank">{l.rank===1?<Crown size={14}/>:l.rank}</span>
    <div><strong>{l.display_name||t('Pelajar spmflow','spmflow student')}{l.is_me&&<em> · {t('anda','you')}</em>}</strong><small>{l.school_name}</small></div>
    <b>{formatTime(l.duration_ms)}{l.mistakes>0&&<small>{l.mistakes} {t('silap','mistakes')}</small>}</b></li>)}</ol>
   <p className="laluan-muted">{t(`${leaders[0].players} pelajar selesai`,`${leaders[0].players} students finished`)}</p></>
  :<p className="laluan-muted">{t('Belum ada sesiapa selesai. Jadilah yang pertama!','Nobody has finished yet. Be the first!')}</p>}
  <p className="laluan-note">{t('Satu percubaan dikira setiap hari. Masa dikira oleh pelayan dari saat anda tekan Mula. Hanya pelajar yang membenarkan paparan papan pendahulu ditunjukkan kepada orang lain.','One attempt counts each day. The server times you from the moment you press Start. Only students who allowed leaderboard display are shown to others.')}</p>
 </section>;

 if(phase==='intro'){const resume=!!run&&!run.finished;
  return <div className="laluan">
   <span className="eyebrow">{t(`LALUAN MASA #${puzzle.number}`,`TIME PATH #${puzzle.number}`)}</span>
   <h2>{t('Lukis satu garisan merentasi sejarah.','Draw one line through history.')}</h2>
   <p className="laluan-scope"><Route size={15}/>{t(`Sejarah Tingkatan ${form}`,`History Form ${form}`)}{scope&&<> · {scope}</>} · {n}×{n} · {cp.length} {t('peristiwa','events')}</p>
   <ul className="laluan-rules">
    <li>{t('Mulakan pada peristiwa yang paling awal dan berakhir pada peristiwa yang paling akhir.','Start at the earliest event and finish at the latest one.')}</li>
    <li>{t('Garisan mesti melalui setiap petak sekali sahaja, ke atas, bawah, kiri atau kanan.','The line must pass through every cell once, moving up, down, left or right.')}</li>
    <li>{t(`Sambung peristiwa ikut urutan kronologi. Salah sambung menambah ${PENALTY_MS/1000} saat.`,`Join the events in chronological order. A wrong join adds ${PENALTY_MS/1000} seconds.`)}</li>
   </ul>
   {resume&&<p className="laluan-warn">{t('Masa anda sudah berjalan sejak anda mula tadi.','Your clock has been running since you started earlier.')}</p>}
   {error&&<p className="error-text" role="alert">{error}</p>}
   <div className="laluan-actions"><button className="button" disabled={busy} onClick={()=>start(!!user)}><Play size={17}/>{busy?t('Sebentar…','Please wait…'):resume?t('Sambung','Continue'):t('Mula','Start')}</button>
    {!user&&<button className="text-button" onClick={login}>{t('Log masuk untuk masuk papan pendahulu','Log in to join the leaderboard')}</button>}</div>
   {board}
  </div>;
 }

 if(phase==='done'&&result){
  return <div className="laluan">
   <span className="eyebrow">{t(`LALUAN MASA #${puzzle.number}`,`TIME PATH #${puzzle.number}`)}</span>
   <h2>{t('Kronologi lengkap!','Chronology complete!')}</h2>
   <div className="laluan-result"><div><strong>{formatTime(result.ms)}</strong><small>{t('masa','time')}</small></div><div><strong>{result.mistakes}</strong><small>{t('salah sambung','wrong joins')}</small></div>{result.rank&&<div><strong>#{result.rank}</strong><small>{t(`daripada ${result.players}`,`of ${result.players}`)}</small></div>}</div>
   {!result.ranked&&<p className="laluan-muted">{user?t('Main semula tidak dikira dalam papan pendahulu.','Replays do not count on the leaderboard.'):t('Log masuk esok supaya masa anda direkodkan.','Log in tomorrow so your time is recorded.')}</p>}
   <div className="laluan-actions"><button className="button" onClick={copy}>{copied?<Check size={16}/>:<Copy size={16}/>}{copied?t('Disalin','Copied'):t('Salin keputusan','Copy result')}</button><button className="text-button" onClick={()=>start(false)}><RotateCcw size={14}/>{t('Main semula','Play again')}</button></div>
   <h3 className="laluan-sub">{t('Urutan sebenar','The real order')}</h3>
   {eventList}
   {board}
  </div>;
 }

 return <div className="laluan laluan-playing">
  <div className="laluan-hud"><span>{t('Peristiwa','Events')} <b>{reached}</b>/{cp.length}</span><span className="laluan-clock"><Clock size={14}/>{formatTime(elapsed)}</span>{mistakes>0&&<span className="laluan-miss"><X size={13}/>{mistakes}</span>}</div>
  <div ref={grid} className="laluan-grid" style={{['--n' as string]:n}} tabIndex={0} role="grid" aria-label={t(`Grid ${n} kali ${n}. Guna kekunci anak panah untuk melukis.`,`${n} by ${n} grid. Use the arrow keys to draw.`)}
   onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}>
   {Array.from({length:n*n},(_,c)=>{const i=cpIndex.get(c);const inPath=path.includes(c);const head=c===path[path.length-1];
    return <div key={c} data-cell={c} role="gridcell" className={'laluan-cell'+(inPath?' lit':'')+(head?' head':'')} aria-label={i!==undefined?t(`Peristiwa ${letters[i]}`,`Event ${letters[i]}`):undefined}>
     {i!==undefined&&<span key={flash?.cp===i?flash.key:undefined} className={'laluan-token'+(i<reached?' on':'')+(flash?.cp===i?' shake':'')}>{letters[i]}</span>}</div>})}
   <svg className="laluan-line" viewBox={`0 0 ${n} ${n}`} aria-hidden>{path.length>1&&<><polyline points={points} className="ink"/><polyline points={points} className="sun"/></>}</svg>
  </div>
  <p className="laluan-hint" role="status">{hint||(path.length?t('Seret untuk teruskan. Seret balik untuk undur.','Drag to continue. Drag back to undo.'):t('Cari peristiwa paling awal dan mula melukis dari situ.','Find the earliest event and start drawing from it.'))}</p>
  {error&&<div className="laluan-actions"><p className="error-text" role="alert">{error}</p><button className="button" disabled={busy} onClick={()=>finish(path,mistakes)}>{t('Hantar semula','Send again')}</button></div>}
  <div className="laluan-actions"><button className="text-button" disabled={!path.length} onClick={()=>setLine(path.slice(0,-1))}><Undo2 size={14}/>{t('Undur','Undo')}</button><button className="text-button" disabled={!path.length} onClick={()=>{setLine([]);setHint('')}}><RotateCcw size={14}/>{t('Padam garisan','Clear line')}</button></div>
  {eventList}
 </div>;
}

import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {BookOpen,Check,Copy,Flame,Lightbulb,Lock,PencilLine,X} from 'lucide-react';
import {useApp} from '../../lib/context';
import {myDay} from '../../lib/daily';
import {sejarahChapters} from '../../lib/curriculum';
import {MAX_TRIES,closeness,compact,judge,matchedPositions,puzzleForDay,summarize,type DayRecord,type History} from '../../lib/faktaHilang';
import type {GameProps} from './ChallengeHub';
import '../../fakta-hilang.css';

const STORE='spmflow.faktaHilang.v1';
const KEEP_DAYS=120;

function loadHistory():History{
 try{const raw=JSON.parse(localStorage.getItem(STORE)||'{}');return raw&&typeof raw==='object'?raw as History:{}}catch{return {}}
}
function saveHistory(history:History){
 const days=Object.keys(history).sort().slice(-KEEP_DAYS);
 try{localStorage.setItem(STORE,JSON.stringify(Object.fromEntries(days.map(d=>[d,history[d]]))))}catch{/* private mode: progress lasts for this visit only */}
}
function untilMidnight(now:number){const my=now+8*3600e3;const left=86400e3-my%86400e3;return {h:Math.floor(left/3600e3),m:Math.floor(left%3600e3/60e3)}}

/* Fakta Hilang: one textbook fact a day with one word or number missing. Five tries.
   Each wrong try says how close it was, locks matching letters into the blank, and opens the next hint. */
export default function IsiTempat({onOpenPage}:GameProps){
 const {t}=useApp();
 const [day,setDay]=useState(myDay);
 const [history,setHistory]=useState<History>(loadHistory);
 const [guess,setGuess]=useState(''),[notice,setNotice]=useState(''),[copied,setCopied]=useState(false);
 const [now,setNow]=useState(Date.now());
 const input=useRef<HTMLInputElement>(null);

 useEffect(()=>{const id=window.setInterval(()=>{const n=Date.now();setNow(n);setDay(d=>myDay(new Date(n))===d?d:myDay(new Date(n)))},30e3);return ()=>window.clearInterval(id)},[]);

 const {puzzle,number}=useMemo(()=>puzzleForDay(day),[day]);
 const record:DayRecord=history[day]??{guesses:[],status:'play'};
 const answer=puzzle.answers[0];
 const wrong=record.guesses.filter(g=>judge(g,puzzle)==='wrong');
 const triesLeft=MAX_TRIES-record.guesses.length;
 const over=record.status!=='play';
 const stats=useMemo(()=>summarize(history,day),[history,day]);
 const [before,after]=puzzle.text.split('___');

 /* Letters locked in by earlier tries, as positions in the answer without spaces. */
 const locked=new Set<number>();
 for(const g of wrong)for(const i of matchedPositions(g,answer))locked.add(i);
 if(wrong.length>=3){let i=0;for(const word of answer.split(' ')){locked.add(i);i+=compact(word).length}}

 function update(next:DayRecord){const h={...history,[day]:next};setHistory(h);saveHistory(h)}

 function submit(e:FormEvent){e.preventDefault();if(over)return;
  const g=guess.trim();
  if(!compact(g)){setNotice(t('Taip jawapan dahulu.','Type an answer first.'));return}
  if(record.guesses.some(prev=>compact(prev)===compact(g))){setNotice(t('Jawapan ini sudah dicuba.','You already tried that.'));return}
  const verdict=judge(g,puzzle),guesses=[...record.guesses,g];
  const status=verdict!=='wrong'?'won':guesses.length>=MAX_TRIES?'lost':'play';
  update({guesses,status});setGuess('');
  setNotice(verdict==='typo'?t(`Diterima! Ejaan tepat: ${answer}.`,`Accepted! Exact spelling: ${answer}.`):'');
  if(status==='play')input.current?.focus();
 }

 function share(){
  const rows=record.guesses.map(g=>judge(g,puzzle)!=='wrong'?'🟨':({close:'▣',near:'▢',far:'·'} as const)[closeness(g,answer).level]).join(' ');
  const text=`Fakta Hilang #${number} · ${record.status==='won'?record.guesses.length:'X'}/${MAX_TRIES}\n${rows}\nspmflow.vercel.app/belajar`;
  navigator.clipboard?.writeText(text).then(()=>{setCopied(true);window.setTimeout(()=>setCopied(false),2000)},()=>{});
 }

 /* Blank slots: one box per letter, gaps between words. */
 let pos=0;
 const slots=answer.split(' ').map((word,w)=><span className="isi-word" key={w}>{[...compact(word)].map((_,k)=>{const i=pos++;const show=over||locked.has(i);const ch=compact(answer)[i];
  return <span key={k} className={'isi-slot'+(show?' on':'')+(over?(record.status==='won'?' won':' lost'):'')}>{show?ch.toUpperCase():''}</span>})}</span>);

 const chapterName=sejarahChapters[puzzle.form]?.[puzzle.chapter-1]??`Bab ${puzzle.chapter}`;
 const hints=[
  {at:1,label:t('Bab','Chapter'),body:chapterName},
  {at:2,label:t('Petunjuk','Clue'),body:puzzle.clue},
  {at:3,label:t('Huruf pertama','First letters'),body:t('Huruf pertama setiap perkataan kini dibuka.','The first letter of each word is now shown.')},
  {at:4,label:t('Buku teks','Textbook'),body:t(`Fakta ini ada di m/s ${puzzle.page}.`,`This fact is on p. ${puzzle.page}.`),page:true}
 ];
 const {h,m}=untilMidnight(now);
 const pct=stats.played?Math.round(stats.won/stats.played*100):0;
 const most=Math.max(1,...stats.dist);

 return <div className="isi-game">
  <header className="isi-head">
   <span className="eyebrow">{t('FAKTA HILANG','MISSING FACT')} · #{number}</span>
   <span className="isi-chip">{t(`Sejarah Tingkatan ${puzzle.form}`,`History Form ${puzzle.form}`)}</span>
  </header>

  <div className="isi-card">
   <p className="isi-fact">{before}<span className="isi-blank" aria-label={t(`Tempat kosong, ${compact(answer).length} huruf`,`Blank, ${compact(answer).length} letters`)}>{slots}</span>{after}</p>
   <div className="isi-lives" aria-label={t(`${triesLeft} peluang lagi`,`${triesLeft} tries left`)}>{Array.from({length:MAX_TRIES},(_,i)=><span key={i} className={i<record.guesses.length?(record.status==='won'&&i===record.guesses.length-1?'hit':'used'):''}/>)}<small>{over?'':t(`${triesLeft} peluang lagi`,`${triesLeft} tries left`)}</small></div>
  </div>

  {!over&&<form className="isi-form" onSubmit={submit}>
   <label className="sr-only" htmlFor="isi-guess">{t('Jawapan anda','Your answer')}</label>
   <input id="isi-guess" ref={input} value={guess} onChange={e=>{setGuess(e.target.value);setNotice('')}} placeholder={t('Isi tempat kosong…','Fill in the blank…')} autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={60}/>
   <button className="button" type="submit"><PencilLine size={16}/>{t('Semak','Check')}</button>
  </form>}
  {notice&&<p className="isi-notice" role="status">{notice}</p>}

  {record.guesses.length>0&&<ol className="isi-tries" aria-label={t('Cubaan anda','Your tries')}>{record.guesses.map((g,i)=>{const v=judge(g,puzzle);
   if(v!=='wrong')return <li key={i} className="right"><Check size={15}/><strong>{g}</strong><span>{t('Tepat!','Correct!')}</span></li>;
   const c=closeness(g,answer),hits=matchedPositions(g,answer).length;
   const level={close:t('Sangat hampir','Very close'),near:t('Hampir','Close'),far:t('Jauh','Far')}[c.level];
   return <li key={i} className={c.level}><X size={15}/><strong>{g}</strong><span>{level}{c.direction&&(c.direction==='later'?t(' · lebih lewat',' · later'):t(' · lebih awal',' · earlier'))}{!c.direction&&hits>0&&t(` · ${hits} huruf di tempat betul`,` · ${hits} letters in place`)}</span></li>})}</ol>}

  {!over&&<section className="isi-hints" aria-label={t('Petunjuk','Hints')}>{hints.map(hint=>{const open=wrong.length>=hint.at;
   return <div key={hint.at} className={'isi-hint'+(open?' open':'')}>{open?<Lightbulb size={15}/>:<Lock size={15}/>}<div><small>{hint.label}</small>{open?<p>{hint.body}{hint.page&&onOpenPage&&<button type="button" className="citation" onClick={()=>onOpenPage(puzzle.form,puzzle.page)}><BookOpen size={13}/>{t('Buka buku teks','Open textbook')}</button>}</p>:<p>{t(`Dibuka selepas ${hint.at} cubaan salah`,`Unlocks after ${hint.at} wrong ${hint.at===1?'try':'tries'}`)}</p>}</div></div>})}</section>}

  {over&&<section className={'isi-result '+record.status} aria-live="polite">
   <strong>{record.status==='won'?(record.guesses.length===1?t('Sekali cuba, terus kena!','First try!'):t(`Tepat dalam ${record.guesses.length} cubaan.`,`Solved in ${record.guesses.length} tries.`)):t('Peluang habis. Jawapannya:','Out of tries. The answer:')}</strong>
   {record.status==='lost'&&<p className="isi-answer">{answer}</p>}
   {puzzle.note&&<p>{puzzle.note}</p>}
   <div className="isi-actions">{onOpenPage&&<button type="button" className="citation" onClick={()=>onOpenPage(puzzle.form,puzzle.page)}><BookOpen size={13}/>{t(`Baca di buku teks · m/s ${puzzle.page}`,`Read in textbook · p. ${puzzle.page}`)}</button>}<button type="button" className="isi-share" onClick={share}>{copied?<Check size={14}/>:<Copy size={14}/>}{copied?t('Disalin','Copied'):t('Salin keputusan','Copy result')}</button></div>
   <p className="isi-next">{t(`Fakta baharu dalam ${h} jam ${m} minit.`,`New fact in ${h}h ${m}m.`)}</p>
  </section>}

  {stats.played>0&&<section className="isi-stats" aria-label={t('Statistik anda','Your stats')}>
   <div className="isi-numbers"><div><strong>{stats.played}</strong><small>{t('Dimainkan','Played')}</small></div><div><strong>{pct}%</strong><small>{t('Menang','Won')}</small></div><div><strong><Flame size={16}/>{stats.streak}</strong><small>{t('Rentetan','Streak')}</small></div><div><strong>{stats.best}</strong><small>{t('Terbaik','Best')}</small></div></div>
   <div className="isi-dist">{stats.dist.map((n,i)=><div key={i} className={record.status==='won'&&record.guesses.length===i+1?'me':''}><span>{i+1}</span><i style={{width:`${Math.max(8,n/most*100)}%`}}>{n}</i></div>)}</div>
   <small className="isi-local">{t('Statistik disimpan dalam pelayar ini sahaja.','Stats are saved in this browser only.')}</small>
  </section>}
 </div>;
}

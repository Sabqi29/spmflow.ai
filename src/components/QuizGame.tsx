import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowRight,Check,Clock,Crown,RotateCcw,Shuffle,Trophy,X,Zap} from 'lucide-react';
import {supabase} from '../lib/api';
import {useApp} from '../lib/context';
import {sejarahChapters,subjects} from '../lib/curriculum';
import {splitOptions} from '../lib/options';

type Question={question_id:string;stem:string;options:Record<string,string>};
type Graded={is_correct:boolean;answer:string};
type Leader={rank:number;display_name:string;school_name:string;score:number;total:number;duration_ms:number;is_me:boolean};
type Phase='setup'|'countdown'|'play'|'done';

const QUIZ_SECONDS=20;
const TILES=[['A','▲','tile-red'],['B','◆','tile-ink'],['C','●','tile-sun'],['D','■','tile-orange']] as const;
/* Only Sejarah questions with a form and chapter tag are in those pools; random mode uses the whole bank. */
const formsWithChapters=[4,5];

function formatMs(ms:number){return `${(ms/1000).toFixed(1)}s`}

/* Kuiz Pantas: 10 timed questions, one at a time, Kahoot-style tiles.
   Signed-in players are graded and timed on the server (start/answer/next RPCs) and ranked on the
   leaderboard by score, then total answering time. Guests play the same game but are not ranked. */
export default function QuizGame(){
 const {t,user,setAuthOpen,setAuthMode}=useApp();
 const [form,setForm]=useState<number|null>(null),[chapter,setChapter]=useState<number|null>(null);
 const [phase,setPhase]=useState<Phase>('setup'),[count,setCount]=useState(3);
 const [gameId,setGameId]=useState<string|null>(null),[guestQuestions,setGuestQuestions]=useState<Question[]>([]);
 const [question,setQuestion]=useState<Question|null>(null),[number,setNumber]=useState(1),[total,setTotal]=useState(10);
 const [pick,setPick]=useState<string|null>(null),[graded,setGraded]=useState<Graded|null>(null);
 const [score,setScore]=useState(0),[duration,setDuration]=useState(0),[left,setLeft]=useState(QUIZ_SECONDS);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [period,setPeriod]=useState<'week'|'all'>('week'),[leaders,setLeaders]=useState<Leader[]>([]);
 const servedAt=useRef(0),pending=useRef<Question|null>(null);

 const category=form===null?t('Rawak · semua bab','Random · all chapters'):chapter===null?t(`Tingkatan ${form} · rawak`,`Form ${form} · random`):(sejarahChapters[form][chapter-1]??'');

 const loadLeaders=useCallback(()=>{if(!user){setLeaders([]);return}
  supabase.rpc('get_quiz_leaderboard',{target_form:form,target_chapter:chapter,period}).then(({data})=>setLeaders((data as Leader[]|null)||[]))},[user,form,chapter,period]);
 useEffect(()=>{if(phase==='setup'||phase==='done')loadLeaders()},[phase,loadLeaders]);

 function show(next:Question,n:number){setQuestion(next);setNumber(n);setPick(null);setGraded(null);setLeft(QUIZ_SECONDS);servedAt.current=performance.now()}

 async function start(){
  setBusy(true);setError('');setScore(0);setDuration(0);setGameId(null);setGuestQuestions([]);
  if(user){
   const {data,error}=await supabase.rpc('start_quiz_game',{target_form:form,target_chapter:chapter});
   const row=(data as (Question&{game_id:string;total:number})[]|null)?.[0];
   if(error||!row){setBusy(false);setError(t('Permainan tidak dapat dimulakan. Cuba lagi.','The game could not start. Try again.'));return}
   setGameId(row.game_id);setTotal(row.total);pending.current={question_id:row.question_id,stem:row.stem,options:row.options};
  }else{
   const {data,error}=await supabase.rpc('pick_guest_quiz',{target_form:form,target_chapter:chapter});
   const rows=(data as Question[]|null)||[];
   if(error||!rows.length){setBusy(false);setError(t('Permainan tidak dapat dimulakan. Cuba lagi.','The game could not start. Try again.'));return}
   setGuestQuestions(rows);setTotal(rows.length);pending.current=rows[0];
  }
  setBusy(false);setCount(3);setPhase('countdown');
 }

 useEffect(()=>{if(phase!=='countdown')return;
  if(count===0){if(pending.current)show(pending.current,1);setPhase('play');return}
  const id=setTimeout(()=>setCount(c=>c-1),700);return()=>clearTimeout(id)},[phase,count]);

 const answer=useCallback(async(choice:string|null)=>{
  if(!question||graded||busy)return;
  setBusy(true);setPick(choice);setError('');
  if(gameId){
   const {data,error}=await supabase.rpc('answer_quiz_game',{target_game:gameId,picked:choice});
   const row=(data as {is_correct:boolean;answer:string;score:number;duration_ms:number;finished:boolean}[]|null)?.[0];
   setBusy(false);
   if(error||!row){setError(t('Jawapan tidak dapat dihantar. Cuba lagi.','Your answer could not be sent. Try again.'));setPick(null);return}
   setGraded({is_correct:row.is_correct,answer:row.answer});setScore(row.score);setDuration(row.duration_ms);
  }else{
   const ms=Math.min(QUIZ_SECONDS*1000,Math.round(performance.now()-servedAt.current));
   const {data,error}=await supabase.rpc('check_guest_quiz',{target_question:question.question_id,picked:choice});
   const row=(data as Graded[]|null)?.[0];
   setBusy(false);
   if(error||!row){setError(t('Jawapan tidak dapat disemak. Cuba lagi.','Your answer could not be checked. Try again.'));setPick(null);return}
   setGraded(row);if(row.is_correct)setScore(s=>s+1);setDuration(d=>d+ms);
  }
 },[question,graded,busy,gameId,t]);

 useEffect(()=>{if(phase!=='play'||graded||busy)return;
  if(left<=0){answer(null);return}
  const id=setTimeout(()=>setLeft(s=>s-1),1000);return()=>clearTimeout(id)},[phase,graded,busy,left,answer]);

 async function next(){
  if(number>=total){setPhase('done');return}
  if(gameId){
   setBusy(true);const {data,error}=await supabase.rpc('next_quiz_question',{target_game:gameId});setBusy(false);
   const row=(data as (Question&{question_number:number})[]|null)?.[0];
   if(error||!row){setError(t('Soalan seterusnya tidak dapat dimuatkan.','The next question could not be loaded.'));return}
   show({question_id:row.question_id,stem:row.stem,options:row.options},row.question_number);
  }else show(guestQuestions[number],number+1);
 }

 function login(){setAuthMode('login');setAuthOpen(true)}

 const board=<section className="game-board" aria-label={t('Leaderboard','Leaderboard')}>
  <div className="game-board-head"><h3><Trophy size={17}/> {t('Paling pantas, semua betul','Fastest, all correct')}</h3>
   <div className="game-period" role="tablist">{(['week','all'] as const).map(p=><button key={p} role="tab" aria-selected={period===p} onClick={()=>setPeriod(p)}>{p==='week'?t('Minggu ini','This week'):t('Sepanjang masa','All time')}</button>)}</div></div>
  <small className="game-board-cat">{category}</small>
  {!user?<p className="muted-copy">{t('Log masuk untuk melihat leaderboard dan merekod masa anda.','Log in to see the leaderboard and record your time.')} <button className="text-button" onClick={login}>{t('Log masuk','Log in')}</button></p>
  :leaders.length?<ol className="game-leaders">{leaders.map(l=><li key={`${l.rank}-${l.display_name}`} className={l.is_me?'me':''}>
   <span className="rank">{l.rank===1&&l.score===l.total?<Crown size={15}/>:l.rank}</span>
   <div><strong>{l.display_name||t('Pelajar spmflow','spmflow student')}{l.is_me&&<em> · {t('anda','you')}</em>}</strong><small>{l.school_name}</small></div>
   <b className={l.score===l.total?'perfect':''}>{l.score}/{l.total}<small><Clock size={11}/> {formatMs(l.duration_ms)}</small></b></li>)}</ol>
  :<p className="muted-copy">{t('Belum ada pemain untuk pilihan ini. Jadilah yang pertama!','No players for this choice yet. Be the first!')}</p>}
  <p className="privacy-note">{t('Disusun ikut jawapan betul, kemudian jumlah masa menjawab. Hanya pelajar yang membenarkan paparan leaderboard ditunjukkan kepada orang lain.','Ranked by correct answers, then total answering time. Only students who allowed leaderboard display are shown to others.')}</p>
 </section>;

 if(phase==='setup')return <div className="quiz-game lined-paper">
  <span className="eyebrow">{t('KUIZ PANTAS','QUICK QUIZ')}</span>
  <h2>{t('Siapa paling pantas?','Who’s the fastest?')}</h2>
  <p>{t(`10 soalan, ${QUIZ_SECONDS} saat setiap satu. Jawab semua dengan betul secepat mungkin untuk naik leaderboard.`,`10 questions, ${QUIZ_SECONDS} seconds each. Get them all right as fast as you can to climb the leaderboard.`)}</p>
  <div className="game-field"><span>{t('Subjek','Subject')}</span><div className="game-chips">{subjects.map(s=><button key={s} type="button" aria-pressed={s==='Sejarah'} disabled={s!=='Sejarah'} title={s==='Sejarah'?undefined:t('Akan datang','Coming soon')}>{s}{s!=='Sejarah'&&<small>{t('akan datang','soon')}</small>}</button>)}</div></div>
  <div className="game-field"><span>{t('Pilih soalan','Questions from')}</span><div className="game-chips">
   <button type="button" aria-pressed={form===null} onClick={()=>{setForm(null);setChapter(null)}}><Shuffle size={14}/>{t('Rawak','Random')}</button>
   {formsWithChapters.map(f=><button key={f} type="button" aria-pressed={form===f} onClick={()=>{setForm(f);setChapter(null)}}>{t(`Tingkatan ${f}`,`Form ${f}`)}</button>)}</div></div>
  {form!==null&&<label className="game-field"><span>{t('Bab','Chapter')}</span><select value={chapter??''} onChange={event=>setChapter(event.target.value?Number(event.target.value):null)}>
   <option value="">{t('Semua bab (rawak)','All chapters (random)')}</option>{sejarahChapters[form].map((name,i)=><option key={name} value={i+1}>{name}</option>)}</select></label>}
  {error&&<p className="error-text" role="alert">{error}</p>}
  <button className="button game-start" disabled={busy} onClick={start}><Zap size={18}/>{busy?t('Sebentar…','Please wait…'):t('Mula main','Start game')}</button>
  {!user&&<p className="game-guest-note">{t('Anda boleh main tanpa akaun, tetapi masa anda hanya masuk leaderboard selepas log masuk.','You can play without an account, but your time only reaches the leaderboard once you log in.')}</p>}
  {board}
  <a className="dataset-link" href="https://github.com/khayyum04/studyflow_v2/blob/main/data/paper_1_dataset.json" target="_blank" rel="noreferrer">{t('Soalan daripada dataset khayyum04/studyflow_v2','Questions from the khayyum04/studyflow_v2 dataset')} ↗</a>
 </div>;

 if(phase==='countdown')return <div className="quiz-game lined-paper game-countdown" aria-live="assertive"><small>{category}</small><strong key={count}>{count||t('Mula!','Go!')}</strong></div>;

 if(phase==='done'){const perfect=score===total;const mine=leaders.find(l=>l.is_me);
  return <div className="quiz-game lined-paper game-done">
   <span className="eyebrow">{category}</span>
   <div className={perfect?'game-medal perfect':'game-medal'}>{perfect?<Crown size={34}/>:<Trophy size={30}/>}</div>
   <h2>{perfect?t('Semua betul!','All correct!'):score>=total*0.7?t('Hampir sempurna!','So close!'):t('Cuba lagi, anda boleh!','Try again, you can do it!')}</h2>
   <div className="game-result"><div><strong>{score}<span>/{total}</span></strong><small>{t('betul','correct')}</small></div><div><strong>{formatMs(duration)}</strong><small>{t('masa menjawab','answering time')}</small></div>{mine&&<div><strong>#{mine.rank}</strong><small>{t('kedudukan terbaik','best rank')}</small></div>}</div>
   {!user&&<p className="game-guest-note">{t('Log masuk supaya masa seterusnya direkodkan di leaderboard.','Log in so your next time is recorded on the leaderboard.')} <button className="text-button" onClick={login}>{t('Log masuk','Log in')}</button></p>}
   {error&&<p className="error-text" role="alert">{error}</p>}
   <div className="set-quiz-actions"><button className="button" disabled={busy} onClick={start}><RotateCcw size={16}/>{t('Main lagi','Play again')}</button><button className="text-button" onClick={()=>setPhase('setup')}>{t('Tukar pilihan','Change options')}</button></div>
   {board}
  </div>}

 if(!question)return null;
 const split=splitOptions(question.options);
 return <div className="quiz-game lined-paper game-play">
  <div className="game-hud"><span>{t('Soalan','Question')} <b>{number}</b>/{total}</span><span className="game-score"><Check size={14}/>{score}</span><span className={left<=5&&!graded?'game-clock low':'game-clock'}><Clock size={14}/>{graded?'–':left}</span></div>
  <div className="game-timer" aria-hidden><span style={{width:`${graded?0:(left/QUIZ_SECONDS)*100}%`}}/></div>
  <h2 className="game-stem">{question.stem}</h2>
  {split.statements.length>0&&<ul className="game-statements">{split.statements.map(([key,value])=><li key={key}><b>{key}</b> {value}</li>)}</ul>}
  <div className="game-tiles">{TILES.filter(([key])=>key in question.options).map(([key,shape,tone])=>{
   const state=graded?(key===graded.answer?'right':key===pick?'wrong':'dim'):'';
   return <button key={key} type="button" className={`game-tile ${tone} ${state}`} disabled={!!graded||busy} onClick={()=>answer(key)}>
    <span className="shape" aria-hidden>{shape}</span><span className="label"><b>{key}</b> {question.options[key]}</span>
    {graded&&key===graded.answer&&<Check size={18} className="mark"/>}{graded&&key===pick&&key!==graded.answer&&<X size={18} className="mark"/>}</button>})}</div>
  {error&&<p className="error-text" role="alert">{error}</p>}
  {graded&&<div className={graded.is_correct?'game-feedback right':'game-feedback wrong'} role="status">
   <strong>{graded.is_correct?t('Betul! +1','Correct! +1'):pick?t(`Salah. Jawapan: ${graded.answer}`,`Wrong. Answer: ${graded.answer}`):t(`Masa tamat. Jawapan: ${graded.answer}`,`Time’s up. Answer: ${graded.answer}`)}</strong>
   <button className="button" disabled={busy} onClick={next}>{number>=total?t('Lihat keputusan','See results'):t('Seterusnya','Next')}<ArrowRight size={16}/></button></div>}
 </div>;
}

import {useEffect,useState} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,Check,Lock,RotateCcw,Sparkles} from 'lucide-react';
import {Link} from 'react-router-dom';
import {supabase,TutorTask} from '../lib/api';
import {useApp} from '../lib/context';
import {getQuestionSet,loadQuestionSet,PastQuestion,splitOptions} from '../lib/questionBank';

type Checked={answer:string;is_correct:boolean};
type Reference={question_id:string;textbook_id:string|null;printed_page:number|null;section_title:string};

/* Normal mode: one question at a time beside the textbook, with Ask AI and a verified page per question.
   Each pick is checked on the server; signed-in students get the set saved to their progress at the end. */
export default function SetQuiz({setId,onAsk,onOpenPage,onExit}:{setId:string;onAsk:(text:string,task:TutorTask)=>void;onOpenPage:(form:number,page:number)=>void;onExit:()=>void}){
 const {t,user}=useApp();const meta=getQuestionSet(setId);
 const [questions,setQuestions]=useState<PastQuestion[]>([]),[error,setError]=useState(''),[index,setIndex]=useState(0),[picks,setPicks]=useState<Record<string,string>>({}),[checked,setChecked]=useState<Record<string,Checked>>({}),[busy,setBusy]=useState(false),[attemptId,setAttemptId]=useState<string|null>(null),[references,setReferences]=useState<Record<string,Reference>>({}),[finished,setFinished]=useState(false),[saved,setSaved]=useState('');
 useEffect(()=>{let active=true;setQuestions([]);setIndex(0);setPicks({});setChecked({});setFinished(false);setSaved('');setAttemptId(null);
  loadQuestionSet(setId).then(rows=>{if(!active)return;setQuestions(rows);supabase.from('question_references').select('question_id,textbook_id,printed_page,section_title').in('question_id',rows.map(row=>row.id)).then(({data})=>{if(active&&data)setReferences(Object.fromEntries((data as Reference[]).map(ref=>[ref.question_id,ref])))})}).catch(()=>{if(active)setError(t('Set ini tidak dapat dimuatkan.','This set could not be loaded.'))});
  if(user)supabase.rpc('start_practice',{target_set:setId,requested_mode:'open'}).then(({data})=>{if(active&&typeof data==='string')setAttemptId(data)});
  return()=>{active=false}},[setId,user,t]);
 const question=questions[index];const pick=question?picks[question.id]:undefined;const result=question?checked[question.id]:undefined;
 const score=Object.values(checked).filter(row=>row.is_correct).length;
 async function check(){if(!question||!pick||busy)return;setBusy(true);setError('');const {data,error}=await supabase.rpc('grade_guest_practice',{target_set:setId,picks:{[question.id]:pick}});setBusy(false);const row=(data as {question_id:string;answer:string;is_correct:boolean}[]|null)?.find(item=>item.question_id===question.id);if(error||!row){setError(t('Jawapan tidak dapat disemak. Cuba lagi.','Your answer could not be checked. Try again.'));return}setChecked(current=>({...current,[question.id]:{answer:row.answer,is_correct:row.is_correct}}))}
 async function finish(){setFinished(true);if(!attemptId)return;const {error}=await supabase.rpc('submit_practice',{target_attempt:attemptId,picks});setSaved(error?t('Skor belum disimpan.','Score could not be saved.'):t('Skor disimpan ke kemajuan anda.','Score saved to your progress.'))}
 function ask(){if(!question)return;const split=splitOptions(question.options);const lines=[`Soalan ${question.question_number}: ${question.stem}`,...split.statements.map(([key,value])=>`${key}. ${value}`),...split.choices.map(([key,value])=>`${key}. ${value}`)];const tail=result?`Jawapan betul ialah ${result.answer}${pick&&pick!==result.answer?`, tetapi saya pilih ${pick}`:''}. Terangkan kenapa berdasarkan buku teks.`:'Beri saya petunjuk berdasarkan buku teks, tanpa memberi jawapan.';onAsk(`${lines.join('\n')}\n${tail}`.slice(0,1500),result?'explain_wrong_answer':'hint')}
 function restart(){setIndex(0);setPicks({});setChecked({});setFinished(false);setSaved('');if(user)supabase.rpc('start_practice',{target_set:setId,requested_mode:'open'}).then(({data})=>{if(typeof data==='string')setAttemptId(data)})}
 const head=<div className="set-quiz-head"><button type="button" className="text-button" onClick={onExit}><ArrowLeft size={15}/>{t('Set soalan','Question sets')}</button><span className="eyebrow">{t('MOD BIASA','NORMAL MODE')} · {meta?.title||setId}</span></div>;
 if(error&&!questions.length)return <div className="quiz-panel">{head}<p className="error-text" role="alert">{error}</p></div>;
 if(!question)return <div className="quiz-panel">{head}<p>{t('Memuatkan soalan…','Loading questions…')}</p></div>;
 if(finished)return <div className="quiz-panel">{head}<div className="flow-orb"><Check size={30}/></div><h2>{t('Set selesai.','Set complete.')}</h2><div className="quiz-score">{score}<span> / {questions.length}</span></div><p>{t(`${Object.keys(checked).length} soalan disemak.`,`${Object.keys(checked).length} questions checked.`)} {saved||(!user&&t('Log masuk untuk menyimpan skor.','Log in to save your score.'))}</p><div className="set-quiz-actions"><button className="button" onClick={restart}><RotateCcw size={16}/>{t('Cuba semula','Try again')}</button><Link className="button ghost" to={`/latihan/${setId}`}><Lock size={16}/>{t('Cuba Locked In','Try Locked In')}</Link></div></div>;
 const split=splitOptions(question.options);const ref=references[question.id];
 return <div className="quiz-panel set-quiz">{head}
  <div className="quiz-progress"><span>{t('Soalan','Question')} {index+1} / {questions.length} · {score} {t('betul','correct')}</span><div style={{width:`${(index+1)/questions.length*100}%`}}/></div>
  <h2>{question.stem}</h2>
  {split.statements.length>0&&<ul className="locked-statements">{split.statements.map(([key,value])=><li key={key}><b>{key}</b> {value}</li>)}</ul>}
  <div className="quiz-options">{split.choices.map(([key,value])=><button key={key} disabled={!!result} aria-pressed={pick===key} className={result?(key===result.answer?'correct':key===pick?'incorrect':''):pick===key?'picked':''} onClick={()=>setPicks(current=>({...current,[question.id]:key}))}><span>{key}</span>{value}{result&&key===result.answer&&<Check size={18}/>}</button>)}</div>
  {error&&<p className="error-text" role="alert">{error}</p>}
  {result&&<div className="quiz-feedback" role="status"><strong>{result.is_correct?t('Tepat sekali!','That’s right!'):t(`Jawapan betul: ${result.answer}`,`Correct answer: ${result.answer}`)}</strong></div>}
  <div className="review-actions"><button type="button" onClick={ask}><Sparkles size={15}/>{result?t('Tanya AI kenapa','Ask AI why'):t('Minta petunjuk AI','Ask AI for a hint')}</button>{ref?.printed_page?<button type="button" onClick={()=>onOpenPage(ref.textbook_id?.endsWith('t5')?5:4,ref.printed_page!)}><BookOpen size={15}/>{t('Buku teks','Textbook')} · {t('m/s','p.')} {ref.printed_page}</button>:<span className="review-hint"><BookOpen size={15}/>{t('Rujukan sedang disemak','Reference being checked')}</span>}</div>
  <div className="set-quiz-actions"><button type="button" className="button ghost" disabled={index===0} onClick={()=>setIndex(i=>i-1)}><ArrowLeft size={16}/></button>
  {!result?<button type="button" className="button" disabled={!pick||busy} onClick={()=>void check()}>{t('Semak jawapan','Check answer')}</button>:index<questions.length-1?<button type="button" className="button" onClick={()=>setIndex(i=>i+1)}>{t('Soalan seterusnya','Next question')}<ArrowRight size={16}/></button>:<button type="button" className="button" onClick={()=>void finish()}>{t('Tamat set','Finish set')}<Check size={16}/></button>}
  {!result&&index<questions.length-1&&<button type="button" className="text-button" onClick={()=>setIndex(i=>i+1)}>{t('Langkau','Skip')}</button>}
  {index===questions.length-1&&!result&&<button type="button" className="text-button" onClick={()=>void finish()}>{t('Tamat set','Finish set')}</button>}</div>
 </div>;
}

import {useEffect,useState} from 'react';
import {ArrowRight,Lock} from 'lucide-react';
import {Link} from 'react-router-dom';
import {useApp} from '../lib/context';
import {sejarahChapters} from '../lib/curriculum';
import {CHAPTER_ROUND,chapterName,chapterSetId,loadChapterCounts} from '../lib/questionBank';

/* "Ikut bab": every Sejarah Form 4 and Form 5 chapter, each with Locked In or Normal mode.
   A round draws up to CHAPTER_ROUND past-paper questions tagged to that chapter. */
export default function ChapterSets({onOpen}:{onOpen:(id:string)=>void}){
 const {t}=useApp();
 const [counts,setCounts]=useState<Record<string,number>|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let active=true;loadChapterCounts().then(rows=>{if(active)setCounts(rows)}).catch(()=>{if(active)setFailed(true)});return()=>{active=false}},[]);
 return <div className="chapter-sets">
  <p className="chapter-sets-note">{t(`Setiap pusingan memberi sehingga ${CHAPTER_ROUND} soalan rawak daripada kertas percubaan lepas yang berkaitan dengan bab itu.`,`Each round gives up to ${CHAPTER_ROUND} random past trial-paper questions linked to that chapter.`)}</p>
  {failed&&<p className="error-text" role="alert">{t('Bilangan soalan tidak dapat dimuatkan. Anda masih boleh cuba bab.','Question counts could not be loaded. You can still try a chapter.')}</p>}
  {[4,5].map(form=><section key={form} className="chapter-form" aria-labelledby={`chapter-form-${form}`}>
   <h3 id={`chapter-form-${form}`}>{t('Tingkatan','Form')} {form}</h3>
   <div className="question-set-list">{sejarahChapters[form].map((_,index)=>{const chapter=index+1;const id=chapterSetId(form,chapter);const count=counts?.[id]??0;const empty=counts!==null&&!failed&&count===0;
    return <article className={'question-set-card chapter-card'+(empty?' is-empty':'')} key={id}><div><span>{t('Bab','Chapter')} {chapter}</span><h3>{chapterName(form,chapter)}</h3><small>{counts===null&&!failed?t('Mengira soalan…','Counting questions…'):empty?t('Belum ada soalan untuk bab ini','No questions for this chapter yet'):failed?t('Sejarah · Kertas 1','History · Paper 1'):`${count} ${t('soalan dalam bank','questions in the bank')}`}</small></div>
     {!empty&&<div className="set-start"><Link className="set-status locked" to={`/latihan/${id}`}><Lock size={13}/>Locked In</Link><button type="button" className="set-status ready" onClick={()=>onOpen(id)}>{t('Mod biasa','Normal mode')}<ArrowRight size={14}/></button></div>}</article>})}</div>
  </section>)}
 </div>;
}

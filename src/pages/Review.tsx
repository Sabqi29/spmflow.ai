import {useCallback,useEffect,useState} from 'react';
import {BookOpen,Check,ClipboardCheck,Pencil,X} from 'lucide-react';
import {Link} from 'react-router-dom';
import {supabase} from '../lib/api';
import {useApp} from '../lib/context';
import {ChapterStat} from '../lib/guide';
import {splitOptions} from '../lib/options';

type QueueRow={reference_id:string;question_id:string;set_id:string;question_number:number;stem:string;options:Record<string,string>;answer:string;form_level:number;chapter_id:number|null;chapter_title:string|null;printed_page:number|null;section_title:string;confidence:number|null;mapping_source:string;verified:boolean;pending:number};
type Draft={form:number;chapter:number;page:string};
type UsageDay={day:string;requests:number;model_calls:number;cache_hits:number;extractive:number;prompt_tokens:number;output_tokens:number;est_cost_usd:number;avg_latency_ms:number|null};

/* Admin-only queue for AI-suggested textbook references. Verified rows become the "Buku teks" links in quiz review. */
export default function Review(){
 const {t,user,isAdmin,authReady}=useApp();const [rows,setRows]=useState<QueueRow[]>([]),[chapters,setChapters]=useState<ChapterStat[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[editing,setEditing]=useState<string|null>(null),[draft,setDraft]=useState<Draft>({form:4,chapter:1,page:''}),[busy,setBusy]=useState(''),[usage,setUsage]=useState<UsageDay[]>([]);
 const load=useCallback(async()=>{setLoading(true);const {data,error}=await supabase.rpc('get_reference_queue',{only_pending:true,max_rows:20});if(error)setError(error.message);else{setError('');setRows((data||[]) as QueueRow[])}setLoading(false)},[]);
 useEffect(()=>{if(!isAdmin){setLoading(false);return}void load();supabase.rpc('get_study_guide').then(({data})=>setChapters((data||[]) as ChapterStat[]));supabase.rpc('get_ai_usage_summary',{days:7}).then(({data})=>setUsage((data||[]) as UsageDay[]))},[isAdmin,load]);
 async function decide(row:QueueRow,decision:'verify'|'reject',correction?:Draft){setBusy(row.reference_id);const {error}=await supabase.rpc('review_reference',{target_reference:row.reference_id,decision,...(correction?{new_form:correction.form,new_chapter:correction.chapter,new_page:Number(correction.page)||null}:{})});setBusy('');if(error){setError(error.message);return}setEditing(null);setRows(current=>current.filter(item=>item.reference_id!==row.reference_id));if(rows.length<=1)void load()}
 function startEdit(row:QueueRow){setEditing(row.reference_id);setDraft({form:row.form_level,chapter:row.chapter_id||1,page:row.printed_page?String(row.printed_page):''})}
 if(!authReady)return null;
 if(!user||!isAdmin)return <main className="feature-shell"><section className="feature-empty"><ClipboardCheck/><h1>{t('Halaman ini untuk pentadbir','This page is for admins')}</h1><p>{t('Semakan rujukan buku teks hanya dibuka kepada pentadbir SPMFlow.','Textbook reference review is only open to SPMFlow admins.')}</p><Link className="button" to="/utama">{t('Kembali','Go back')}</Link></section></main>;
 const pending=rows[0]?.pending??0;
 return <main className="feature-shell review-queue"><div className="feature-heading"><div><span className="eyebrow">{t('SEMAKAN RUJUKAN','REFERENCE REVIEW')}</span><h1>{t('Sahkan halaman buku teks.','Confirm textbook pages.')}</h1><p className="muted-copy">{t(`${pending} cadangan AI menunggu. Hanya rujukan yang disahkan dipaparkan kepada pelajar.`,`${pending} AI suggestions waiting. Only verified references are shown to students.`)}</p></div></div>
 <section className="feature-card ai-usage"><div className="card-heading"><div><span className="eyebrow">{t('PENGGUNAAN AI · 7 HARI','AI USAGE · 7 DAYS')}</span><h2>{t('Kos dan cache tutor','Tutor cost and cache')}</h2></div></div>{usage.length?<table><thead><tr><th>{t('Hari','Day')}</th><th>{t('Soalan','Requests')}</th><th>{t('Panggilan AI','AI calls')}</th><th>Cache</th><th>{t('Tanpa AI','No AI')}</th><th>Token</th><th>{t('Anggaran kos','Est. cost')}</th></tr></thead><tbody>{usage.map(row=><tr key={row.day}><td>{row.day}</td><td>{row.requests}</td><td>{row.model_calls}</td><td>{row.cache_hits}</td><td>{row.extractive}</td><td>{(Number(row.prompt_tokens)+Number(row.output_tokens)).toLocaleString()}</td><td>${Number(row.est_cost_usd).toFixed(4)}</td></tr>)}</tbody></table>:<p className="muted-copy">{t('Belum ada data penggunaan.','No usage yet.')}</p>}</section>
 {error&&<p className="error-text" role="alert">{error}</p>}
 {loading?<p className="feature-loading">{t('Memuatkan…','Loading…')}</p>:!rows.length?<p className="muted-copy">{t('Semua cadangan sudah disemak.','Every suggestion has been reviewed.')}</p>:rows.map(row=>{const split=splitOptions(row.options);const formChapters=chapters.filter(item=>item.form_level===draft.form);return <article key={row.reference_id} className="bento-card review-item">
  <small>{row.set_id} · {t('Soalan','Question')} {row.question_number}</small><p>{row.stem}</p>
  {split.statements.length>0&&<ul className="locked-statements">{split.statements.map(([key,value])=><li key={key}><b>{key}</b> {value}</li>)}</ul>}
  <ul className="review-options">{split.choices.map(([key,value])=><li key={key} className={row.answer===key?'is-answer':''}><b>{key}</b> {value}{row.answer===key&&<Check size={15}/>}</li>)}</ul>
  <div className="review-suggestion"><span><b>{t('Cadangan','Suggestion')}:</b> T{row.form_level} · {t('Bab','Ch.')} {row.chapter_id} {row.chapter_title} · {t('m/s','p.')} {row.printed_page??'—'}{row.section_title&&` · ${row.section_title}`}</span><span className="review-confidence">{Math.round((row.confidence??0)*100)}%</span>{row.printed_page&&<Link className="chip" to={`/belajar?form=${row.form_level}&page=${row.printed_page}`} target="_blank"><BookOpen size={14}/>&nbsp;{t('Buka halaman','Open page')}</Link>}</div>
  {editing===row.reference_id?<form className="review-edit" onSubmit={event=>{event.preventDefault();void decide(row,'verify',draft)}}>
   <label>{t('Tingkatan','Form')}<select value={draft.form} onChange={event=>{const form=Number(event.target.value);setDraft({form,chapter:chapters.find(item=>item.form_level===form)?.chapter_id||1,page:''})}}><option value={4}>4</option><option value={5}>5</option></select></label>
   <label>{t('Bab','Chapter')}<select value={draft.chapter} onChange={event=>setDraft({...draft,chapter:Number(event.target.value)})}>{formChapters.map(item=><option key={item.chapter_id} value={item.chapter_id}>{item.chapter_id}. {item.chapter_title}</option>)}</select></label>
   <label>{t('Muka surat bercetak','Printed page')}<input type="number" min={1} required value={draft.page} onChange={event=>setDraft({...draft,page:event.target.value})}/></label>
   <button className="button small" disabled={busy===row.reference_id}><Check size={15}/>{t('Simpan & sahkan','Save & verify')}</button><button type="button" className="text-button" onClick={()=>setEditing(null)}>{t('Batal','Cancel')}</button></form>
  :<div className="review-actions"><button type="button" disabled={busy===row.reference_id} onClick={()=>void decide(row,'verify')}><Check size={15}/>{t('Sahkan','Verify')}</button><button type="button" disabled={busy===row.reference_id} onClick={()=>startEdit(row)}><Pencil size={15}/>{t('Betulkan','Correct')}</button><button type="button" disabled={busy===row.reference_id} onClick={()=>void decide(row,'reject')}><X size={15}/>{t('Tolak','Reject')}</button></div>}
 </article>})}
 </main>;
}

import {useEffect,useMemo,useState} from 'react';
import {ArrowRight,BookOpen,CalendarClock,Check,Flame,Sparkles,Target,Trophy} from 'lucide-react';
import {Link,Navigate} from 'react-router-dom';
import {supabase} from '../lib/api';
import {useApp} from '../lib/context';
import {Result,dayKey,dueIn,greeting,summarize} from '../lib/progress';
import {questionSets} from '../lib/questionBank';

type Leader={display_name:string;school_name:string;correct:number;answered:number;accuracy:number};
type Assignment={id:string;title:string;due_at:string|null;question_set_id:string|null;class_id:string};
type Session={id:string;title:string;form_level:number;created_at:string};

export default function Home(){
 const {t,lang,user,authReady}=useApp();
 const [results,setResults]=useState<Result[]>([]),[sessions,setSessions]=useState<Session[]>([]),[assignments,setAssignments]=useState<Assignment[]>([]),[leaders,setLeaders]=useState<Leader[]>([]),[name,setName]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{if(!user)return;let active=true;(async()=>{const since=new Date(Date.now()-86400000).toISOString();const [quiz,chats,work,board,profile]=await Promise.all([
  supabase.from('quiz_results').select('score,total,created_at').order('created_at',{ascending:false}).limit(500),
  supabase.from('chat_sessions').select('id,title,form_level,created_at').order('created_at',{ascending:false}).limit(5),
  supabase.from('class_assignments').select('id,title,due_at,question_set_id,class_id').gte('due_at',since).order('due_at').limit(4),
  supabase.rpc('get_weekly_leaderboard'),
  supabase.from('profiles').select('display_name').eq('id',user.id).maybeSingle()
 ]);if(!active)return;const issue=quiz.error||chats.error||work.error;if(issue)setError(issue.message);
  setResults((quiz.data||[]) as Result[]);setSessions((chats.data||[]) as Session[]);setAssignments((work.data||[]) as Assignment[]);setLeaders(((board.data||[]) as Leader[]).slice(0,3));setName(profile.data?.display_name||String(user.user_metadata.display_name||''));setLoading(false)})();return()=>{active=false}},[user]);
 const stats=useMemo(()=>summarize(results),[results]);
 const today=dayKey(new Date());
 const quick=useMemo(()=>questionSets[Math.floor(Math.random()*questionSets.length)],[]);
 if(!user)return authReady?<Navigate to="/" replace/>:<main className="feature-shell"><p className="feature-loading">{t('Memuatkan…','Loading…')}</p></main>;
 const last=sessions[0];
 const missions=[
  {done:results.some(row=>dayKey(row.created_at)===today),label:t('Jawab satu set latihan','Finish one practice set'),to:`/latihan/${quick?.id}`},
  {done:sessions.some(row=>dayKey(row.created_at)===today),label:t('Tanya tutor satu soalan','Ask the tutor one question'),to:'/belajar'},
  {done:stats.streak>=3,label:t('Kekalkan streak 3 hari','Keep a 3-day streak'),to:'/dashboard'}
 ];
 const prompts=[t('Apa itu Malayan Union?','What was the Malayan Union?'),t('Ringkaskan Bab 2 Tingkatan 4','Summarise Form 4 Chapter 2'),t('Terangkan Perlembagaan 1957','Explain the 1957 Constitution')];
 return <main className="bento-page home-page">
 <section className="bento home-bento">
  <div className="bento-card home-hero"><div><span className="tag-pill">{greeting(new Date().getHours(),lang)}{name?`, ${name}`:''} 👋</span><h1 className="retro">{t('Jom sambung','Let’s keep')}<br/>{t('belajar!','going!')}</h1><p className="home-streak"><Flame size={20}/>{stats.streak?t(`Streak anda ${stats.streak} hari. Siapkan misi hari ini untuk kekalkan api.`,`You’re on a ${stats.streak}-day streak. Finish today’s mission to keep it alive.`):t('Mulakan streak baharu hari ini dengan satu set latihan.','Start a new streak today with one practice set.')}</p><div className="button-row"><Link className="button" to="/belajar">{t('Sambung belajar','Continue studying')} <ArrowRight size={18}/></Link>{quick&&<Link className="button ghost" to={`/latihan/${quick.id}`}>{t('Latihan pantas','Quick practice')}</Link>}</div></div><img className="art-9aplus" src="/assets/art/9aplus-students.webp" alt="" width={1000} height={829}/></div>
  <aside className="bento-card home-missions"><h3>{t('Misi hari ini','Today’s missions')}</h3><ul>{missions.map(m=><li key={m.label} className={m.done?'done':''}><span className="tick">{m.done&&<Check size={14}/>}</span><Link to={m.to}>{m.label}</Link></li>)}</ul><small>{missions.filter(m=>m.done).length} / {missions.length} {t('siap','done')}</small></aside>
  <div className="stat-cards">{[[String(stats.streak),t('Hari streak','Day streak')],[String(stats.answered),t('Soalan dijawab','Questions answered')],[`${stats.accuracy}%`,t('Ketepatan','Accuracy')],[String(stats.sessions),t('Sesi latihan','Practice sessions')]].map(([n,l])=><div className="bento-card stat-card" key={l}><strong>{loading?'…':n}</strong><span>{l}</span></div>)}</div>
  <article className="bento-card home-resume"><span className="lbl">{t('SAMBUNG DI SINI','PICK UP HERE')}</span>{last?<><h3>{last.title}</h3><small>Sejarah · {t(`Tingkatan ${last.form_level}`,`Form ${last.form_level}`)}</small><Link className="text-link" to="/belajar">{t('Buka semula ruang belajar','Reopen the study space')} <ArrowRight size={15}/></Link></>:<><h3>{t('Belum ada perbualan','No conversations yet')}</h3><Link className="text-link" to="/belajar">{t('Buka buku teks','Open the textbook')} <BookOpen size={15}/></Link></>}</article>
  <article className="bento-card home-tutor"><h3><Sparkles size={18}/> {t('Tanya tutor AI','Ask the AI tutor')}</h3><p>{t('Jawapan berpandukan buku teks, lengkap dengan rujukan halaman.','Answers grounded in the textbook, with page references.')}</p><div className="chip-row">{prompts.map(p=><Link key={p} className="chip" to={`/belajar?q=${encodeURIComponent(p)}`}>{p}</Link>)}</div></article>
  <article className="bento-card home-work"><h3><CalendarClock size={18}/> {t('Tugasan kelas','Class assignments')}</h3>{assignments.length?assignments.map(a=>{const due=dueIn(a.due_at);return <div className="work-row" key={a.id}><div><strong>{a.title}</strong><small>{due.overdue?t('Tamat tempoh','Overdue'):due.days===null?t('Tiada tarikh akhir','No due date'):t(`${due.days} hari lagi`,`${due.days} days left`)}</small></div>{a.question_set_id&&<Link className="chip" to={`/latihan/${a.question_set_id}?assignment=${a.id}`}>{t('Jawab','Start')}</Link>}</div>}):<p className="muted-copy">{t('Tiada tugasan baharu. Sertai kelas cikgu anda dengan kod jemputan.','No new assignments. Join your teacher’s class with an invite code.')} <Link to="/kelas">{t('Kelas','Classes')} →</Link></p>}</article>
  <article className="bento-card home-board"><h3><Trophy size={18}/> {t('Leaderboard minggu ini','This week’s leaderboard')}</h3>{leaders.length?leaders.map((l,i)=><div className="leader-row" key={i}><span className="rank">{i+1}</span><div><strong>{l.display_name||t('Pelajar spmflow','spmflow student')}</strong><small>{l.school_name||''}</small></div><b>{l.accuracy}%</b></div>):<p className="muted-copy">{t('Belum ada peserta minggu ini.','No participants yet this week.')}</p>}<Link className="text-link" to="/dashboard">{t('Leaderboard penuh','Full leaderboard')} <ArrowRight size={15}/></Link></article>
  <article className="bento-card home-subjects"><h3><Target size={18}/> {t('Subjek','Subjects')}</h3><div className="chip-row"><Link className="chip live" to="/belajar">Sejarah ✓</Link>{['Bahasa Melayu','Matematik','Biologi','Kimia','Fizik','English'].map(s=><span key={s} className="chip off">{s}</span>)}</div><small>{t('Subjek lain akan datang.','More subjects coming soon.')}</small></article>
 </section>
 {error&&<p className="error-text" role="alert">{error}</p>}
 </main>;
}

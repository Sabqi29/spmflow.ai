import {useEffect,useMemo,useState} from 'react';
import {BarChart3,BookOpen,Flame,MessageCircle,Target,Trophy} from 'lucide-react';
import {Link} from 'react-router-dom';
import {supabase} from '../lib/api';
import {useApp} from '../lib/context';

type Result={score:number;total:number;created_at:string};
type Leader={display_name:string;school_name:string;correct:number;answered:number;accuracy:number};

function dayKey(value:Date|string){const date=new Date(value);return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
function calculateStreak(results:Result[]){
 const days=new Set(results.map(result=>dayKey(result.created_at)));const cursor=new Date();
 if(!days.has(dayKey(cursor)))cursor.setDate(cursor.getDate()-1);
 let streak=0;while(days.has(dayKey(cursor))){streak+=1;cursor.setDate(cursor.getDate()-1)}return streak;
}

export default function Dashboard(){
 const {t,user,setAuthMode,setAuthOpen}=useApp();const [results,setResults]=useState<Result[]>([]),[chatCount,setChatCount]=useState(0),[leaders,setLeaders]=useState<Leader[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{if(!user){setLoading(false);return}let active=true;(async()=>{setLoading(true);const [quiz,chats,board]=await Promise.all([
  supabase.from('quiz_results').select('score,total,created_at').order('created_at',{ascending:false}),
  supabase.from('chat_sessions').select('id',{count:'exact',head:true}),
  supabase.rpc('get_weekly_leaderboard')
 ]);if(!active)return;const issue=quiz.error||chats.error||board.error;if(issue)setError(issue.message);else{setResults((quiz.data||[]) as Result[]);setChatCount(chats.count||0);setLeaders((board.data||[]) as Leader[])}setLoading(false)})();return()=>{active=false}},[user]);
 const stats=useMemo(()=>{const answered=results.reduce((sum,row)=>sum+row.total,0),correct=results.reduce((sum,row)=>sum+row.score,0);return{answered,correct,accuracy:answered?Math.round(correct/answered*100):0,streak:calculateStreak(results)}},[results]);
 const week=useMemo(()=>Array.from({length:7},(_,index)=>{const date=new Date();date.setDate(date.getDate()-(6-index));const rows=results.filter(row=>dayKey(row.created_at)===dayKey(date));return{label:new Intl.DateTimeFormat(document.documentElement.lang,{weekday:'short'}).format(date),value:rows.reduce((sum,row)=>sum+row.total,0)}}),[results]);
 if(!user)return <main className="feature-shell"><section className="feature-empty"><BarChart3/><h1>{t('Dashboard kemajuan anda','Your progress dashboard')}</h1><p>{t('Log masuk untuk menyimpan keputusan, membina streak dan menyertai leaderboard mingguan.','Sign in to save results, build a streak and join the weekly leaderboard.')}</p><button className="button" onClick={()=>{setAuthMode('login');setAuthOpen(true)}}>{t('Log masuk','Log in')}</button></section></main>;
 return <main className="feature-shell"><div className="feature-heading"><div><span className="eyebrow">{t('KEMAJUAN SAYA','MY PROGRESS')}</span><h1>{t('Sedikit demi sedikit, semakin yakin.','Small steps, growing confidence.')}</h1></div><Link className="button" to="/belajar">{t('Sambung belajar','Continue studying')} <BookOpen size={17}/></Link></div>
 {loading?<p className="feature-loading">{t('Mengira kemajuan anda…','Calculating your progress…')}</p>:error?<p className="error-text" role="alert">{error}</p>:<>
 <section className="stat-grid"><article><Flame/><span>{t('Streak semasa','Current streak')}</span><strong>{stats.streak}</strong><small>{t('hari','days')}</small></article><article><Target/><span>{t('Soalan dijawab','Questions answered')}</span><strong>{stats.answered}</strong><small>{stats.correct} {t('betul','correct')}</small></article><article><Trophy/><span>{t('Ketepatan keseluruhan','Overall accuracy')}</span><strong>{stats.accuracy}%</strong><small>{results.length} {t('sesi kuiz','quiz sessions')}</small></article><article><MessageCircle/><span>{t('Perbualan tutor','Tutor conversations')}</span><strong>{chatCount}</strong><small>{t('disimpan','saved')}</small></article></section>
 <section className="dashboard-grid"><article className="feature-card"><div className="card-heading"><div><span className="eyebrow">{t('7 HARI TERAKHIR','LAST 7 DAYS')}</span><h2>{t('Aktiviti latihan','Practice activity')}</h2></div></div><div className="weekly-bars">{week.map(day=><div key={day.label}><span title={`${day.value} soalan`} style={{height:`${Math.max(8,Math.min(100,day.value*8))}%`}}/><strong>{day.value}</strong><small>{day.label}</small></div>)}</div></article>
 <article className="feature-card leaderboard-card"><div className="card-heading"><div><span className="eyebrow">{t('MINGGU INI','THIS WEEK')}</span><h2>{t('Leaderboard komuniti','Community leaderboard')}</h2></div><Trophy/></div>{leaders.length?leaders.map((leader,index)=><div className="leader-row" key={`${leader.display_name}-${index}`}><span className="rank">{index+1}</span><div><strong>{leader.display_name||t('Pelajar spmflow','spmflow student')}</strong><small>{leader.school_name||t('Sekolah tidak dipaparkan','School not shown')}</small></div><b>{leader.correct} / {leader.answered}<small>{leader.accuracy}%</small></b></div>):<p className="muted-copy">{t('Belum ada peserta minggu ini. Aktifkan kebenaran leaderboard semasa mendaftar untuk muncul di sini.','No participants yet this week. Enable leaderboard consent during sign-up to appear here.')}</p>}<p className="privacy-note">{t('Hanya nama panggilan dan sekolah pengguna yang memilih untuk menyertai akan dipaparkan.','Only users who opt in have their display name and school shown.')}</p></article></section></>}
 </main>;
}

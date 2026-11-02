import {lazy,Suspense,useState,type ComponentType} from 'react';
import {ArrowLeft,ArrowRight,PencilLine,Route} from 'lucide-react';
import {useApp} from '../../lib/context';
import '../../challenge.css';

export type GameProps={onOpenPage?:(form:number,printedPage:number)=>void};
type Game={id:string;icon:typeof Route;title:[string,string];blurb:[string,string];Component:ComponentType<GameProps>|null};

/* The Cabaran tab: one card per daily game. A game with Component null shows as "akan datang".
   To add a game, put it in src/components/challenge/ and add a lazy() entry here. */
const GAMES:Game[]=[
 {id:'kronologi',icon:Route,title:['Laluan Masa','Time Path'],blurb:['Sambung peristiwa dalam buku teks mengikut kronologi. Siapa paling laju?','Join textbook events in chronological order. Who is fastest?'],Component:lazy(()=>import('./LaluanMasa'))},
 {id:'isi',icon:PencilLine,title:['Fakta Hilang','Missing Fact'],blurb:['Satu fakta Sejarah, satu tempat kosong, lima peluang untuk mengisinya.','One History fact, one blank, five chances to fill it.'],Component:lazy(()=>import('./IsiTempat'))}
];

export default function ChallengeHub({onOpenPage}:GameProps){
 const {t}=useApp();
 const [open,setOpen]=useState<string|null>(null);
 const game=GAMES.find(g=>g.id===open&&g.Component);
 if(game?.Component){const Game=game.Component;
  return <div className="cabaran-shell"><button type="button" className="cabaran-back" onClick={()=>setOpen(null)}><ArrowLeft size={15}/>{t('Semua cabaran','All challenges')}</button><Suspense fallback={<p className="cabaran-loading" role="status">{t('Memuatkan…','Loading…')}</p>}><Game onOpenPage={onOpenPage}/></Suspense></div>;
 }
 return <div className="cabaran-shell cabaran-home">
  <span className="eyebrow">{t('CABARAN HARIAN','DAILY CHALLENGES')}</span>
  <h2>{t('Satu cabaran baharu setiap hari.','A new challenge every day.')}</h2>
  <p>{t('Semua soalan diambil daripada buku teks Sejarah Tingkatan 4 dan 5. Cabaran bertukar pada tengah malam.','Every question comes from the Form 4 and 5 History textbooks. Challenges change at midnight.')}</p>
  <div className="cabaran-cards">{GAMES.map(g=>{const Icon=g.icon;const ready=!!g.Component;
   return <button key={g.id} type="button" className="cabaran-card" disabled={!ready} onClick={()=>setOpen(g.id)}><span className="cabaran-icon"><Icon size={22}/></span><span className="cabaran-text"><strong>{t(...g.title)}</strong><small>{t(...g.blurb)}</small></span>{ready?<ArrowRight size={18}/>:<em>{t('Akan datang','Coming soon')}</em>}</button>})}</div>
 </div>;
}

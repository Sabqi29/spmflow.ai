import {useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowUpRight,RotateCcw,Sparkles} from 'lucide-react';
import {useApp} from '../lib/context';

/* A real Paper 1 question from the bank (2022 Johor trial, Q1). Pick an answer to see the tutor explain it. */
const question={
 q:'Senarai berikut berkaitan ciri negara bangsa Kerajaan Kesultanan Melayu Melaka.',
 list:['Nobat','Regalia','Cap mohor'],
 ask:'Apakah ciri tersebut?',
 options:{A:'Lambang kebesaran',B:'Undang-undang',C:'Kedaulatan',D:'Kerajaan'} as Record<string,string>,
 answer:'A'
};

export default function HeroQuestion(){
 const {t}=useApp();
 const [pick,setPick]=useState('');
 const card=useRef<HTMLDivElement>(null);
 const reduce=typeof window!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 function tilt(e:React.PointerEvent){if(reduce||e.pointerType!=='mouse'||!card.current)return;const r=card.current.getBoundingClientRect();const x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;card.current.style.setProperty('--rx',`${(-y*5).toFixed(2)}deg`);card.current.style.setProperty('--ry',`${(x*6).toFixed(2)}deg`)}
 function reset(){card.current?.style.setProperty('--rx','0deg');card.current?.style.setProperty('--ry','0deg')}
 const right=pick===question.answer;
 return <div className="hq-stage" onPointerMove={tilt} onPointerLeave={reset}>
  <div className="hq-sheet back" aria-hidden="true"/><div className="hq-sheet mid" aria-hidden="true"/>
  <div className="hq-card" ref={card}>
   <div className="hq-meta"><span className="hq-tag">Sejarah · K1</span><span>{t('Percubaan Johor 2022 · S1','Johor Trial 2022 · Q1')}</span></div>
   <p className="hq-q">{question.q}</p>
   <ul className="hq-list">{question.list.map(item=><li key={item}>{item}</li>)}</ul>
   <p className="hq-ask">{question.ask}</p>
   <div className="hq-options" role="radiogroup" aria-label={t('Pilihan jawapan','Answer choices')}>
    {Object.entries(question.options).map(([k,v])=>{const state=!pick?'':k===question.answer?'correct':k===pick?'wrong':'dim';return <button key={k} type="button" role="radio" aria-checked={pick===k} disabled={!!pick} className={state} onClick={()=>setPick(k)}><span className="bubble">{k}</span>{v}</button>})}
   </div>
   <div className={pick?'hq-tutor on':'hq-tutor'} aria-live="polite">
    {pick&&<><span className="hq-tutor-label"><Sparkles size={13}/>{right?t('Tepat! · Flow, tutor AI','Correct! · Flow, AI tutor'):t('Hampir! · Flow, tutor AI','Nearly! · Flow, AI tutor')}</span>
    <p>{t('Nobat, regalia dan cap mohor ialah alat kebesaran diraja. Ia melambangkan kebesaran dan kedaulatan Sultan Melaka, jadi jawapannya ','Nobat, regalia and the royal seal are royal regalia. They symbolise the grandeur of the Melaka Sultan, so the answer is ')}<strong>A</strong>.</p>
    <div className="hq-tutor-actions"><Link to="/belajar">{t('Tanya Flow lagi','Ask Flow more')} <ArrowUpRight size={14}/></Link><button type="button" onClick={()=>setPick('')}><RotateCcw size={13}/>{t('Cuba lagi','Try again')}</button></div></>}
   </div>
   {!pick&&<p className="hq-hint">{t('Cuba jawab. Pilih satu.','Have a go. Pick one.')}</p>}
  </div>
  <span className="hq-sticker" aria-hidden="true">2,560<small>{t('soalan','questions')}</small></span>
 </div>;
}

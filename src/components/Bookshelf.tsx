import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ArrowRight,Bell} from 'lucide-react';
import {useApp} from '../lib/context';
import '../bookshelf.css';

/* One textbook per SPM subject. Only live subjects open; the rest stay shrink-wrapped. */
type Book={id:string;bm:string;en:string;color:string;h:number;w:number;glyph:keyof typeof glyphs;live?:boolean;light?:boolean;to?:string};
const glyphs={
 scroll:'M5 6h12a3 3 0 0 1 0 6H7a3 3 0 0 0 0 6h14M5 6a2 2 0 1 0 0 4',
 quote:'M5 14c0-5 2-8 6-8M13 14c0-5 2-8 6-8M5 14h5v5H5zM13 14h5v5h-5z',
 abc:'M4 18 8 6l4 12M5.5 14h5M14 6h4a3 3 0 0 1 0 6h-4zm0 6h5a3 3 0 0 1 0 6h-5z',
 pi:'M5 7h14M9 7v11M15 7v8a3 3 0 0 0 3 3',
 sigma:'M18 5H6l7 7-7 7h12',
 leaf:'M5 19C5 9 11 5 20 5c0 9-5 14-15 14zM5 19 13 11',
 flask:'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.5 15h9',
 atom:'M3 12a9 3.6 0 1 0 18 0a9 3.6 0 1 0-18 0M7.5 4.2a9 3.6 60 1 0 9 15.6a9 3.6 60 1 0-9-15.6M16.5 4.2a9 3.6 120 1 0-9 15.6a9 3.6 120 1 0 9-15.6',
 moon:'M19 15A8 8 0 1 1 10 4a6 6 0 0 0 9 11z',
 ledger:'M5 4h14v16H5zM8 9h8M8 13h8M8 17h5'
};
const books:Book[]=[
 {id:'sejarah',bm:'Sejarah',en:'History',color:'#8e2f2a',h:318,w:70,glyph:'scroll',live:true,to:'/belajar'},
 {id:'bm',bm:'Bahasa Melayu',en:'Malay Language',color:'#2f5d8c',h:300,w:66,glyph:'quote'},
 {id:'english',bm:'Bahasa Inggeris',en:'English',color:'#e3d7c4',h:288,w:58,glyph:'abc',light:true},
 {id:'math',bm:'Matematik',en:'Mathematics',color:'#d6a23a',h:304,w:62,glyph:'pi',light:true},
 {id:'addmath',bm:'Matematik Tambahan',en:'Additional Maths',color:'#4f437e',h:326,w:72,glyph:'sigma'},
 {id:'biologi',bm:'Biologi',en:'Biology',color:'#2f6b4f',h:296,w:68,glyph:'leaf'},
 {id:'kimia',bm:'Kimia',en:'Chemistry',color:'#1f6f78',h:284,w:60,glyph:'flask'},
 {id:'fizik',bm:'Fizik',en:'Physics',color:'#33384f',h:310,w:66,glyph:'atom'},
 {id:'pi',bm:'Pendidikan Islam',en:'Islamic Studies',color:'#5e7f3c',h:292,w:60,glyph:'moon'},
 {id:'akaun',bm:'Prinsip Perakaunan',en:'Accounting',color:'#a8553a',h:280,w:58,glyph:'ledger'}
];

function Glyph({d}:{d:string}){return <svg className="shelf-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d}/></svg>}

export default function Bookshelf(){
 const {t}=useApp();const navigate=useNavigate();
 const shelf=useRef<HTMLDivElement>(null);
 const [selected,setSelected]=useState(0);
 const [note,setNote]=useState('');
 const [fine,setFine]=useState(true);
 const reduce=typeof window!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 useEffect(()=>{setFine(matchMedia('(hover:hover) and (pointer:fine)').matches)},[]);
 useEffect(()=>{if(!note)return;const id=setTimeout(()=>setNote(''),2600);return()=>clearTimeout(id)},[note]);
 const book=books[selected];

 function pull(i:number,scroll=false){
  setSelected(i);
  if(scroll)shelf.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({behavior:reduce?'auto':'smooth',inline:'center',block:'nearest'});
 }

 /* The book flies to the centre of the screen and its cover swings open, then we enter the subject. */
 function open(i:number){
  const b=books[i];
  if(!b.live||!b.to){setNote(t(`${b.bm} akan datang. Kami sedang menyediakannya.`,`${b.en} is coming soon. We are preparing it.`));return}
  const el=shelf.current?.querySelector(`[data-i="${i}"]`);
  if(reduce||!el||!('animate' in Element.prototype)){navigate(b.to);return}
  const src=el.getBoundingClientRect();
  const fw=Math.min(260,innerWidth*.5),fh=fw*1.38;
  const f=document.createElement('div');f.className='shelf-flight';f.style.setProperty('--c',b.color);
  Object.assign(f.style,{left:src.left+'px',top:src.top+'px',width:src.width+'px',height:src.height+'px'});
  const inside=document.createElement('div');inside.className='inside';
  const cover=document.createElement('div');cover.className='cover';cover.textContent=b.bm;
  f.append(inside,cover);document.body.appendChild(f);
  const tx=innerWidth/2-fw/2-src.left,ty=innerHeight/2-fh/2-src.top;
  const move=f.animate([{transform:'translate(0,0) scale(1,1)'},{transform:`translate(${tx}px,${ty}px) scale(${fw/src.width},${fh/src.height})`}],{duration:520,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
  move.onfinish=()=>{
   const swing=cover.animate([{transform:'rotateY(0)'},{transform:'rotateY(-165deg)'}],{duration:460,easing:'cubic-bezier(.65,0,.35,1)',fill:'forwards'});
   swing.onfinish=()=>{navigate(b.to!);f.animate([{opacity:1},{opacity:0}],{duration:240,fill:'forwards'}).onfinish=()=>f.remove()};
  };
 }

 return <section className="bookshelf-section" id="rak">
  <div className="shelf-head">
   <div>
    <h2>{t('Ambil satu buku.','Take a book.')}<br/>{t('Mula berlatih.','Start practising.')}</h2>
    <p>{t('Setiap subjek ialah buku teks di rak anda. Tarik satu untuk mula membaca, bertanya dan berlatih.','Every subject is a textbook on your shelf. Pull one out to start reading, asking and practising.')}</p>
   </div>
   <div className="shelf-pull-note" aria-hidden="true"><span>{t('tarik satu!','pull one out!')}</span><svg viewBox="0 0 72 60" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 8 C30 6 52 18 56 50"/><path d="M44 40 L56 52 L64 38"/></svg></div>
  </div>

  <div className="shelf-zone">
   <div className="shelf-scroll">
    <div className="shelf-row" ref={shelf} role="list" aria-label={t('Rak subjek SPM','SPM subject shelf')} onMouseLeave={()=>fine&&pull(0)}>
     <svg className="shelf-deco" width="92" height="150" viewBox="0 0 92 150" aria-hidden="true"><g stroke="#141a3d" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"><path d="M30 148 V96 h32 v52" fill="#fbfbff"/><path d="M30 108 h32" fill="none"/><path d="M46 96 C34 74 18 70 10 52 C26 54 40 66 46 96 C48 66 60 44 82 38 C76 62 60 74 46 96" fill="#5e7f3c"/><path d="M46 96 C44 70 46 40 40 18 C54 34 54 66 46 96" fill="#2f6b4f"/></g></svg>
     {books.map((b,i)=>{
      const pulled=i===selected;
      const cls=['shelf-book',b.live?'':'soon',b.light?'light':'',pulled?'pulled':'',i===selected-1?'lean-l':'',i===selected+1?'lean-r':''].filter(Boolean).join(' ');
      return <button key={b.id} type="button" role="listitem" data-i={i} className={cls}
       style={{['--c' as string]:b.color,['--h' as string]:`${b.h}px`,['--w' as string]:`${b.w}px`}}
       aria-label={`${t(b.bm,b.en)}${b.live?'':' · '+t('akan datang','coming soon')}`}
       onMouseEnter={()=>fine&&pull(i)} onFocus={()=>pull(i)}
       onClick={()=>{if(fine||selected===i)open(i);else pull(i,true)}}>
       <span className="spine"><Glyph d={glyphs[b.glyph]}/><span className="spine-title">{t(b.bm,b.en)}</span><span className="spine-form">T4·T5</span></span>
       {b.live?<span className="ribbon" aria-hidden="true"/>:<span className="sticker" aria-hidden="true">{t('Akan datang','Soon')}</span>}
      </button>})}
     <svg className="shelf-deco" width="150" height="150" viewBox="0 0 150 150" aria-hidden="true"><g stroke="#141a3d" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"><rect x="6" y="122" width="96" height="26" rx="2" fill="#dfe3f7"/><rect x="12" y="98" width="88" height="24" rx="2" fill="#ffc53d"/><rect x="2" y="76" width="92" height="22" rx="2" fill="#fbfbff"/><path d="M10 87 h50M18 110 h40M14 135 h56" strokeWidth="2"/><path d="M112 148 V108 h30 v40 z" fill="#c2342a"/><path d="M118 108 L114 54 M127 108 L130 46 M136 108 L146 62" fill="none"/><path d="M130 46 l-3 -8 l6 0 z" fill="#141a3d"/></g></svg>
    </div>
   </div>
   <div className="shelf-plank" aria-hidden="true"/>
  </div>

  <div className="shelf-info" aria-live="polite" style={{['--c' as string]:book.color}}>
   <div>
    <h3>{t(book.bm,book.en)}</h3>
    <p>{book.live?t('Tingkatan 4 dan 5. Buku teks penuh, tutor AI dengan rujukan muka surat dan bank soalan Kertas 1.','Form 4 and 5. Full textbook, an AI tutor with page references and a Paper 1 question bank.'):t('Masih dalam plastik. Kami sedang menyusun soalan dan buku teks untuk subjek ini.','Still in its plastic wrap. We are preparing questions and the textbook for this subject.')}</p>
   </div>
   {book.live?<button type="button" className="button" onClick={()=>open(selected)}>{t('Buka buku','Open book')} <ArrowRight size={17}/></button>
    :<button type="button" className="button outline" onClick={()=>open(selected)}><Bell size={16}/>{t('Akan datang','Coming soon')}</button>}
  </div>
  <p className="shelf-hint">{fine?t('Halakan tetikus pada buku untuk menariknya. Klik untuk membuka.','Hover a book to pull it out. Click to open it.'):t('Ketik buku sekali untuk menariknya, ketik lagi untuk membuka.','Tap a book once to pull it out, tap again to open it.')}</p>
  <div className={note?'shelf-toast on':'shelf-toast'} role="status">{note}</div>
 </section>;
}

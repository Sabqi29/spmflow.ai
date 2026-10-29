import {useMemo,useState,type ReactNode} from 'react';
import {List,Network,Lightbulb} from 'lucide-react';
import {useApp} from '../lib/context';
import {buildFlowMap,parseAnswer,parseInline,tipHeading,type ListItem} from '../lib/tutorFormat';

/* Renders without dangerouslySetInnerHTML, so model text can never inject markup. */
function Inline({text}:{text:string}){
 return <>{parseInline(text).map((part,i)=>part.bold?<strong key={i}>{part.text}</strong>:part.italic?<em key={i}>{part.text}</em>:<span key={i}>{part.text}</span>)}</>;
}

function Items({items,ordered}:{items:ListItem[];ordered:boolean}):ReactNode{
 const Tag=ordered?'ol':'ul';
 return <Tag>{items.map((item,i)=><li key={i}><Inline text={item.text}/>{item.children.length>0&&<Items items={item.children} ordered={false}/>}</li>)}</Tag>;
}

export default function TutorAnswer({text,question}:{text:string;question?:string}){
 const {t}=useApp();const [view,setView]=useState<'notes'|'map'>('notes');
 const blocks=useMemo(()=>parseAnswer(text),[text]);
 const map=useMemo(()=>buildFlowMap(text,question),[text,question]);
 return <div className="tutor-answer">
  {map&&<div className="answer-view" role="tablist" aria-label={t('Paparan jawapan','Answer view')}>
   <button type="button" role="tab" aria-selected={view==='notes'} onClick={()=>setView('notes')}><List size={13}/>{t('Nota','Notes')}</button>
   <button type="button" role="tab" aria-selected={view==='map'} onClick={()=>setView('map')}><Network size={13}/>{t('Peta minda','Mind map')}</button>
  </div>}
  {view==='map'&&map?<div className="flow-map">
   <div className="flow-topic">{map.topic}</div>
   <ol className="flow-branches">{map.branches.map((branch,i)=><li key={i}><span className="flow-step">{i+1}</span><div><strong>{branch.title}</strong>{branch.details.length>0&&<ul>{branch.details.map((d,j)=><li key={j}>{d}</li>)}</ul>}</div></li>)}</ol>
   {map.tips.map((tip,i)=><div key={i} className="answer-tip"><Lightbulb size={14}/><span><strong>{tip.label}:</strong> {tip.text}</span></div>)}
  </div>:<div className="answer-notes">{blocks.map((block,i)=>{
   if(block.type==='heading')return tipHeading.test(block.text)?<h4 key={i} className="tip-heading"><Lightbulb size={14}/><Inline text={block.text}/></h4>:<h4 key={i}><Inline text={block.text}/></h4>;
   if(block.type==='list')return <Items key={i} items={block.items} ordered={block.ordered}/>;
   return <p key={i}><Inline text={block.text}/></p>;
  })}</div>}
 </div>;
}

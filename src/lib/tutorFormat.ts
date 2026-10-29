// Turns the tutor's light Markdown (headings, lists, **bold**) into blocks, and those blocks into a flow map.
// Pure functions with no React, so they are unit-tested from tests/tutorFormat.test.ts.

export type ListItem = {text:string;children:ListItem[]};
export type Block = {type:'heading';text:string}|{type:'para';text:string}|{type:'list';ordered:boolean;items:ListItem[]};
export type Inline = {text:string;bold?:boolean;italic?:boolean};
export type FlowBranch = {title:string;details:string[]};
export type Tip = {label:string;text:string};
export type FlowMap = {topic:string;branches:FlowBranch[];tips:Tip[]};

const listLine=/^(\s*)([-*•]|\d+[.)])\s+(.*)$/;
const headingLine=/^\s*#{1,6}\s+(.*?)\s*#*\s*$/;

/* Splits an answer into paragraphs, headings and nested lists. Indentation of 2+ spaces nests an item under the previous one. */
export function parseAnswer(text:string):Block[]{
 const blocks:Block[]=[];let para:string[]=[];let list:{ordered:boolean;items:ListItem[];stack:{indent:number;item:ListItem}[]}|null=null;
 const flushPara=()=>{if(para.length){blocks.push({type:'para',text:para.join(' ')});para=[]}};
 const flushList=()=>{if(list){blocks.push({type:'list',ordered:list.ordered,items:list.items});list=null}};
 for(const raw of text.replace(/\r\n?/g,'\n').split('\n')){
  const line=raw.replace(/\s+$/,'');
  if(!line.trim()){flushPara();continue}
  const heading=line.match(headingLine);
  if(heading){flushPara();flushList();blocks.push({type:'heading',text:heading[1]});continue}
  const bulletOnly=line.match(/^\s*\*\*([^*]+)\*\*:?\s*$/);
  const item=line.match(listLine);
  if(item){
   flushPara();const indent=item[1].replace(/\t/g,'  ').length;const ordered=/\d/.test(item[2]);const node:ListItem={text:item[3],children:[]};
   if(!list){list={ordered,items:[],stack:[]}}
   while(list.stack.length&&list.stack[list.stack.length-1].indent>=indent)list.stack.pop();
   const parent=list.stack[list.stack.length-1];
   if(parent&&indent>=parent.indent+2)parent.item.children.push(node);else{list.items.push(node);list.stack=[]}
   list.stack.push({indent,item:node});continue
  }
  // A line continuing a list item (wrapped text) joins that item.
  if(list&&/^\s{2,}\S/.test(line)&&list.stack.length){const last=list.stack[list.stack.length-1].item;last.text+=' '+line.trim();continue}
  if(bulletOnly&&!para.length){flushList();blocks.push({type:'heading',text:bulletOnly[1]});continue}
  flushList();para.push(line.trim())
 }
 flushPara();flushList();return blocks
}

/* Splits **bold** and *italic* runs. Unpaired markers stay as plain text. */
export function parseInline(text:string):Inline[]{
 const out:Inline[]=[];const pattern=/\*\*(.+?)\*\*|__(.+?)__|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/g;let last=0;let match:RegExpExecArray|null;
 while((match=pattern.exec(text))){if(match.index>last)out.push({text:text.slice(last,match.index)});if(match[1]??match[2])out.push({text:(match[1]??match[2]) as string,bold:true});else out.push({text:match[3],italic:true});last=pattern.lastIndex}
 if(last<text.length)out.push({text:text.slice(last)});
 return out.filter(part=>part.text)
}

export const plainText=(text:string)=>parseInline(text).map(part=>part.text).join('').trim();

export const tipHeading=/tip|petua|ingat|hafal|exam|peperiksaan|remember|memori[sz]e/i;

/* "**Sultan:** ketua..." becomes title "Sultan" and detail "ketua...". Long plain items are cut at a natural break. */
function splitItem(text:string){
 const lead=text.match(/^\*\*(.+?)\*\*\s*[:\-–—]?\s*(.*)$/);
 if(lead)return {title:plainText(lead[1]).replace(/[:.]$/,''),rest:plainText(lead[2])};
 const plain=plainText(text);const cut=plain.search(/[:–—]\s|,\s|\.\s/);
 if(cut>0&&cut<=60)return {title:plain.slice(0,cut),rest:plain.slice(cut+1).trim()};
 return {title:plain.length>60?plain.slice(0,57).trimEnd()+'…':plain,rest:''};
}
const short=(text:string,max=110)=>text.length>max?text.slice(0,max-1).trimEnd()+'…':text;

/* Builds a topic → key points → details map from the answer's lists. Returns null when the answer has fewer than two points. */
export function buildFlowMap(text:string,question=''):FlowMap|null{
 const blocks=parseAnswer(text);let branches:FlowBranch[]=[];const tips:Tip[]=[];let tipLabel:string|null=null;
 for(const block of blocks){
  if(block.type==='heading'){tipLabel=tipHeading.test(block.text)?plainText(block.text):null;continue}
  if(tipLabel){const words=block.type==='para'?block.text:block.items.map(i=>i.text).join(' ');const last=tips[tips.length-1];if(last?.label===tipLabel)last.text=short(last.text+' '+plainText(words),240);else tips.push({label:tipLabel,text:short(plainText(words),240)});continue}
  if(block.type!=='list')continue;
  for(const item of block.items){
   const {title,rest}=splitItem(item.text);
   const details=[...(rest?[rest]:[]),...item.children.map(child=>plainText(child.text))].filter(Boolean).slice(0,3).map(d=>short(d));
   branches.push({title,details})
  }
 }
 // When the answer has one list with a single parent, its children are the real points.
 if(branches.length===1){const only=blocks.find((b):b is Extract<Block,{type:'list'}>=>b.type==='list');const kids=only?.items[0]?.children??[];if(kids.length>=2)branches=kids.map(k=>{const {title,rest}=splitItem(k.text);return {title,details:[...(rest?[short(rest)]:[]),...k.children.map(c=>short(plainText(c.text)))].slice(0,3)}})}
 if(branches.length<2)return null;
 const intro=blocks.find(b=>b.type==='para');
 const topic=question.trim()?short(question.trim().replace(/\?+$/,''),90):intro?short(plainText(intro.text).split(/(?<=\.)\s/)[0],90):'Isi penting';
 return {topic,branches:branches.slice(0,8),tips}
}

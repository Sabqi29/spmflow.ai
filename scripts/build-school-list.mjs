import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

const sources=process.argv.slice(2);
if(sources.length!==2){
  throw new Error('Usage: node scripts/build-school-list.mjs <wikipedia-part-1.json> <wikipedia-part-2.json>');
}

const states={
  Perlis:'Perlis',Kedah:'Kedah',Pulau_Pinang:'Pulau Pinang',Perak:'Perak',Selangor:'Selangor',
  Wilayah_Persekutuan_Kuala_Lumpur:'W.P. Kuala Lumpur',Wilayah_Persekutuan_Putrajaya:'W.P. Putrajaya',
  Negeri_Sembilan:'Negeri Sembilan',Melaka:'Melaka',Johor:'Johor',Kelantan:'Kelantan',
  Terengganu:'Terengganu',Pahang:'Pahang',Sabah:'Sabah',Sarawak:'Sarawak',
  Wilayah_Persekutuan_Labuan:'W.P. Labuan'
};

function text(html){
  return html
    .replace(/<br\s*\/?>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&nbsp;/g,' ')
    .replace(/\s+/g,' ').trim();
}

function heading(id){
  return id.replace(/\.([0-9A-F]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))).replaceAll('_',' ').replace(/\s+\d+$/,'').trim();
}

function listSchoolName(html){
  const value=text(html).replace(/\s*\[[^\]]+\]\s*/g,' ').replace(/\s+/g,' ').trim();
  if(!/\b(SMK|SMJK|Sekolah|Maktab|Maahad|Madrasah|Kolej)\b/i.test(value))return '';
  return value.split(/\s+-\s+/)[0].replace(/\s*,\s*(?:di\s+)?[A-Z][^,]*$/,'').trim();
}

const schools=[];
for(const source of sources){
  const html=JSON.parse(readFileSync(source,'utf8')).parse.text;
  const headings=[...html.matchAll(/<h2\b[^>]*id="([^"]+)"[^>]*>/g)];
  for(let i=0;i<headings.length;i++){
    const state=states[headings[i][1]];
    if(!state)continue;
    const start=(headings[i].index??0)+headings[i][0].length;
    const end=headings[i+1]?.index??html.length;
    const section=html.slice(start,end);
    const subheadings=[...section.matchAll(/<h3\b[^>]*id="([^"]+)"[^>]*>/g)];
    const blocks=[{index:0,type:'Sekolah Menengah'},...subheadings.map(item=>({index:(item.index??0)+item[0].length,type:heading(item[1])}))];
    for(let blockIndex=0;blockIndex<blocks.length;blockIndex++){
      const block=section.slice(blocks[blockIndex].index,blocks[blockIndex+1]?.index??section.length);
      const type=blocks[blockIndex].type;
      const rows=block.matchAll(/<tr>\s*<td[^>]*>\s*([A-Z]{3,4}[A-Z0-9]{3,5})\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g);
      for(const row of rows){
        const name=text(row[2]);
        if(name)schools.push({code:row[1],name,state,type});
      }
      for(const item of block.matchAll(/<li>([\s\S]*?)<\/li>/g)){
        const name=listSchoolName(item[1]);
        if(name)schools.push({code:'',name,state,type});
      }
    }
  }
}

const unique=[...new Map(schools.map(s=>[s.code||`${s.state}|${s.name.toLocaleLowerCase('ms')}`,s])).values()]
  .sort((a,b)=>a.state.localeCompare(b.state,'ms')||a.name.localeCompare(b.name,'ms'));
const output=resolve('src/data/malaysia-secondary-schools.json');
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify(unique));
console.log(`Wrote ${unique.length} schools to ${output}`);

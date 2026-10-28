export type ChapterStat={form_level:number;chapter_id:number;chapter_title:string;page_start:number;answered:number;correct:number;accuracy:number|null};

/* Chapters to study next: weakest tried chapters first (needs a few answers to count), then untried ones in textbook order. */
export function focusChapters(rows:ChapterStat[],count=3,minAnswered=3){
 const tried=rows.filter(row=>row.answered>=minAnswered&&(row.accuracy??0)<85).sort((a,b)=>(a.accuracy??0)-(b.accuracy??0)||b.answered-a.answered);
 const untried=rows.filter(row=>row.answered===0).sort((a,b)=>a.form_level-b.form_level||a.chapter_id-b.chapter_id);
 return [...tried,...untried].slice(0,count);
}

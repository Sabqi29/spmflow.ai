export type Result={score:number;total:number;created_at:string};

export function dayKey(value:Date|string){const date=new Date(value);return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}

/* Consecutive days with at least one result, counting today or (if nothing yet today) from yesterday. */
export function calculateStreak(results:Result[],now=new Date()){
 const days=new Set(results.map(result=>dayKey(result.created_at)));const cursor=new Date(now);
 if(!days.has(dayKey(cursor)))cursor.setDate(cursor.getDate()-1);
 let streak=0;while(days.has(dayKey(cursor))){streak+=1;cursor.setDate(cursor.getDate()-1)}return streak;
}

export function summarize(results:Result[],now=new Date()){
 const answered=results.reduce((sum,row)=>sum+row.total,0),correct=results.reduce((sum,row)=>sum+row.score,0);
 return{answered,correct,accuracy:answered?Math.round(correct/answered*100):0,streak:calculateStreak(results,now),sessions:results.length};
}

export function greeting(hour:number,lang:'bm'|'en'){
 if(hour<12)return lang==='bm'?'Selamat pagi':'Good morning';
 if(hour<15)return lang==='bm'?'Selamat tengah hari':'Good afternoon';
 if(hour<19)return lang==='bm'?'Selamat petang':'Good evening';
 return lang==='bm'?'Selamat malam':'Good night';
}

/* Due label for an assignment, or null once it is overdue by more than a day. */
export function dueIn(due:string|null,now=new Date()){
 if(!due)return{days:null as number|null,overdue:false};
 const ms=new Date(due).getTime()-now.getTime();const days=Math.ceil(ms/86400000);
 return{days,overdue:ms<0};
}

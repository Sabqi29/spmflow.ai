/* Daily games roll over at midnight Malaysia time (UTC+8, no daylight saving). */
const MY_OFFSET_MS=8*60*60*1000;
const DAY_MS=24*60*60*1000;

/** Today's date in Asia/Kuala_Lumpur as 'YYYY-MM-DD'. */
export function myDay(now:Date=new Date()):string{
 return new Date(now.getTime()+MY_OFFSET_MS).toISOString().slice(0,10);
}

/** Whole days from `epoch` ('YYYY-MM-DD') to `day` ('YYYY-MM-DD'), so day 0 is the epoch itself. */
export function dayIndex(epoch:string,day:string=myDay()):number{
 return Math.round((Date.parse(day+'T00:00:00Z')-Date.parse(epoch+'T00:00:00Z'))/DAY_MS);
}

/** The day before `day` ('YYYY-MM-DD'). */
export function previousDay(day:string):string{
 return new Date(Date.parse(day+'T00:00:00Z')-DAY_MS).toISOString().slice(0,10);
}

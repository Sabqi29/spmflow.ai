import catalog from '../data/question-set-catalog.json';
import {supabase} from './api';
import {sejarahChapters} from './curriculum';

export type QuestionSet={id:string;year:number;title:string;paper:string;questions:number;sourceUrl:string;chapter?:{form:number;chapter:number}};
/* Served from the database without the answer key; grading happens on the server. */
export type PastQuestion={id:string;set_id:string;question_number:number;stem:string;options:Record<string,string>};
export type ReviewRow={question_id:string;choice:string|null;answer:string|null;is_correct:boolean|null};

export const questionSets=catalog as QuestionSet[];
const datasetUrl='https://github.com/khayyum04/studyflow_v2/blob/main/data/paper_1_dataset.json';

/* Practice by chapter: each Sejarah chapter is a virtual set `bab-t<form>-<chapter>`.
   A round is a fresh random draw from every past-paper question tagged to that chapter. */
export const CHAPTER_ROUND=20;
export const chapterSetId=(form:number,chapter:number)=>`bab-t${form}-${chapter}`;
export function parseChapterSet(id:string){const m=/^bab-t([45])-(\d{1,2})$/.exec(id);return m?{form:Number(m[1]),chapter:Number(m[2])}:null}
export function chapterName(form:number,chapter:number){const label=sejarahChapters[form]?.[chapter-1];return label?label.replace(/^Bab \d+ · /,''):`Bab ${chapter}`}

function shuffle<T>(items:T[]){const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy}

export async function loadQuestionSet(id:string){
 const chapter=parseChapterSet(id);
 if(chapter){
  const {data,error}=await supabase.from('questions').select('id,set_id,question_number,stem,options').eq('form_level',chapter.form).eq('chapter_id',chapter.chapter);
  if(error)throw error;
  return shuffle((data||[]) as PastQuestion[]).slice(0,CHAPTER_ROUND);
 }
 const {data,error}=await supabase.from('questions').select('id,set_id,question_number,stem,options').eq('set_id',id).order('question_number');
 if(error)throw error;
 return (data||[]) as PastQuestion[];
}

/* How many tagged questions each chapter has, keyed by chapter set id. */
export async function loadChapterCounts(){
 const {data,error}=await supabase.from('question_sets').select('id,question_count').eq('paper','BAB');
 if(error)throw error;
 return Object.fromEntries((data||[]).map(row=>[row.id as string,row.question_count as number])) as Record<string,number>;
}

export function getQuestionSet(id:string):QuestionSet|undefined{
 const chapter=parseChapterSet(id);
 if(chapter)return sejarahChapters[chapter.form]?.[chapter.chapter-1]?{id,year:0,title:chapterName(chapter.form,chapter.chapter),paper:'BAB',questions:CHAPTER_ROUND,sourceUrl:datasetUrl,chapter}:undefined;
 return questionSets.find(set=>set.id===id);
}

export {splitOptions} from './options';

import catalog from '../data/question-set-catalog.json';
import {supabase} from './api';

export type QuestionSet={id:string;year:number;title:string;paper:string;questions:number;sourceUrl:string};
/* Served from the database without the answer key; grading happens on the server. */
export type PastQuestion={id:string;set_id:string;question_number:number;stem:string;options:Record<string,string>};
export type ReviewRow={question_id:string;choice:string|null;answer:string|null;is_correct:boolean|null};

export const questionSets=catalog as QuestionSet[];

export async function loadQuestionSet(id:string){
 const {data,error}=await supabase.from('questions').select('id,set_id,question_number,stem,options').eq('set_id',id).order('question_number');
 if(error)throw error;
 return (data||[]) as PastQuestion[];
}

export function getQuestionSet(id:string){return questionSets.find(set=>set.id===id)}

export {splitOptions} from './options';

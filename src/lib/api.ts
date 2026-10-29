import { createClient } from '@supabase/supabase-js';
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://fysjjwszkegjcqszqvnq.supabase.co';
export const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_8tZPxBqn4guneYQM89aIKw_8q_gWLs5';
export const supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY);
export type Source = {kind?:'textbook';chapter_title?:string;section_title?:string;page:number;form?:string;chunk_id?:string;snippet?:string};
export type WebSource = {kind:'web';title:string;url:string};
export type SearchSuggestion = {kind:'search';query:string};
export type AnswerSource = Source|WebSource|SearchSuggestion;
/* Where an answer came from: the textbook, the internet (Wikipedia or Google Search), or neither (outside the syllabus). */
export type AnswerOrigin = 'textbook'|'web'|'none';
export type Message = {id:string;role:'user'|'assistant';content:string;sources?:AnswerSource[];degraded?:boolean;origin?:AnswerOrigin};
export const isTextbookSource=(s:AnswerSource):s is Source=>!s.kind||s.kind==='textbook';
export const isWebSource=(s:AnswerSource):s is WebSource=>s.kind==='web'&&/^https:\/\//.test(s.url);
/* Wikipedia answers get their own label; Google Search answers keep the general internet one. */
export const isWikipediaSource=(s:AnswerSource)=>isWebSource(s)&&/^https:\/\/[a-z-]+\.wikipedia\.org\//.test(s.url);
export const isSearchSuggestion=(s:AnswerSource):s is SearchSuggestion=>s.kind==='search'&&typeof s.query==='string';
/* Saved chats have no origin column, so it is worked out from the stored sources. */
export function answerOrigin(m:Message):AnswerOrigin|undefined{if(m.origin)return m.origin;if(m.role!=='assistant')return undefined;if(m.sources?.some(isWebSource))return 'web';if(m.sources?.some(isTextbookSource))return 'textbook';return undefined}
export type Textbook = {id:string;title:string;url:string;printed_page_offset:number;pdf_page_count:number;expires_in:number};
export async function getTextbook(form:number):Promise<Textbook>{
 const response=await fetch(`${SUPABASE_URL}/functions/v1/spmflow-textbook?form_level=${form}`,{headers:{apikey:PUBLISHABLE_KEY},signal:AbortSignal.timeout(20000)});
 const data=await response.json();
 if(!response.ok)throw new Error(data.error||'Textbook is not available yet.');
 return data as Textbook;
}
export type PracticeRef={attempt_id:string;question_id:string};
/* What the student wants; the tutor function picks the model and prompt from it. */
export type TutorTask='ask'|'hint'|'explain_wrong_answer';
export async function askTutor(question:string, form:number, practice?:PracticeRef|null,task?:TutorTask):Promise<{text:string;sources:AnswerSource[];degraded:boolean;origin:AnswerOrigin}>{
 const {data:{session}}=await supabase.auth.getSession();
 const response=await fetch(`${SUPABASE_URL}/functions/v1/spmflow-ask`,{method:'POST',headers:{'Content-Type':'application/json',apikey:PUBLISHABLE_KEY,...(session?{Authorization:`Bearer ${session.access_token}`}:{})},body:JSON.stringify({question,form_level:form,subject:'sejarah',...(practice?{practice}:{}),...(task?{task_type:task}:{})}),signal:AbortSignal.timeout(60000)});
 const data=await response.json();
 if(!response.ok) throw new Error(response.status===429?'Had soalan harian telah dicapai. Cuba lagi esok.':response.status===423?'Tutor AI ditutup semasa Locked In. Hantar latihan anda dahulu.':data.error||'Tutor belum dapat dihubungi. Cuba lagi.');
 const sources:AnswerSource[]=data.sources||(data.source?[data.source]:[]);
 const origin:AnswerOrigin=data.answer_source==='web'||data.answer_source==='none'?data.answer_source:sources.length?'textbook':'none';
 return {text:data.text||data.answer,sources,degraded:!!data.degraded,origin};
}
export async function joinWaitlist(email:string){const {error}=await supabase.from('waitlist').insert({email:email.trim().toLowerCase(),source:'pricing_pro'});if(error&&error.code!=='23505')throw error;}
export async function saveConversation(userId:string,sessionId:string|null,question:string,answer:Message,form:number,practice?:PracticeRef|null){
 let id=sessionId;
 if(!id){const {data,error}=await supabase.from('chat_sessions').insert({user_id:userId,title:question.slice(0,80),form_level:form,...(practice?{attempt_id:practice.attempt_id,question_id:practice.question_id}:{})}).select('id').single();if(error)throw error;id=data.id;}
 const {error}=await supabase.from('chat_messages').insert([{session_id:id,user_id:userId,role:'user',content:question},{session_id:id,user_id:userId,role:'assistant',content:answer.content,sources:answer.sources||[],degraded:answer.degraded||false}]);if(error)throw error;return id;
}

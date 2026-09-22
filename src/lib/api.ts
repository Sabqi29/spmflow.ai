import { createClient } from '@supabase/supabase-js';
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://fysjjwszkegjcqszqvnq.supabase.co';
export const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_8tZPxBqn4guneYQM89aIKw_8q_gWLs5';
export const supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY);
export type Source = {chapter_title?:string;section_title?:string;page:number;form?:string;chunk_id?:string;snippet?:string};
export type Message = {id:string;role:'user'|'assistant';content:string;sources?:Source[];degraded?:boolean};
export async function askTutor(question:string, form:number):Promise<{text:string;sources:Source[];degraded:boolean}>{
 const {data:{session}}=await supabase.auth.getSession();
 const response=await fetch(`${SUPABASE_URL}/functions/v1/spmflow-ask`,{method:'POST',headers:{'Content-Type':'application/json',apikey:PUBLISHABLE_KEY,...(session?{Authorization:`Bearer ${session.access_token}`}:{})},body:JSON.stringify({question,form_level:form,subject:'sejarah'}),signal:AbortSignal.timeout(60000)});
 const data=await response.json();
 if(!response.ok) throw new Error(response.status===429?'Had soalan harian telah dicapai. Cuba lagi esok.':data.error||'Tutor belum dapat dihubungi. Cuba lagi.');
 return {text:data.text||data.answer,sources:data.sources||(data.source?[data.source]:[]),degraded:!!data.degraded};
}
export async function joinWaitlist(email:string){const {error}=await supabase.from('waitlist').insert({email:email.trim().toLowerCase(),source:'pricing_pro'});if(error&&error.code!=='23505')throw error;}
export async function saveConversation(userId:string,sessionId:string|null,question:string,answer:Message,form:number){
 let id=sessionId;
 if(!id){const {data,error}=await supabase.from('chat_sessions').insert({user_id:userId,title:question.slice(0,80),form_level:form}).select('id').single();if(error)throw error;id=data.id;}
 const {error}=await supabase.from('chat_messages').insert([{session_id:id,user_id:userId,role:'user',content:question},{session_id:id,user_id:userId,role:'assistant',content:answer.content,sources:answer.sources||[],degraded:answer.degraded||false}]);if(error)throw error;return id;
}

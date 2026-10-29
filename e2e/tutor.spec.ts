import {expect,test} from '@playwright/test';

// Contract tests for the spmflow-ask Edge Function. They call the deployed function directly and never change it.
// Rejections cost no quota and always run; the one real question spends a guest question, so it runs only with E2E_TUTOR=1.
const base=`${process.env.E2E_SUPABASE_URL||'https://fysjjwszkegjcqszqvnq.supabase.co'}/functions/v1/spmflow-ask`;
const key=process.env.E2E_SUPABASE_KEY||'sb_publishable_8tZPxBqn4guneYQM89aIKw_8q_gWLs5';
const ask=(request:import('@playwright/test').APIRequestContext,data:Record<string,unknown>)=>request.post(base,{headers:{apikey:key,'Content-Type':'application/json'},data});

test('rejects bad input before using quota',async({request})=>{
 expect((await ask(request,{question:'',form_level:4})).status()).toBe(400);
 expect((await ask(request,{question:'Apakah nasionalisme?',form_level:3})).status()).toBe(400);
 expect((await ask(request,{question:'Apakah sel?',form_level:4,subject:'biologi'})).status()).toBe(400);
});

test('guests cannot ask about a practice question',async({request})=>{
 const response=await ask(request,{question:'Kenapa jawapan saya salah?',form_level:4,practice:{attempt_id:'00000000-0000-0000-0000-000000000000',question_id:'2024_kedah_1_1'}});
 expect(response.status()).toBe(401);
 expect(JSON.stringify(await response.json())).not.toMatch(/"answer"/);
});

test('answers a textbook question with a real page citation',async({request})=>{
 test.skip(process.env.E2E_TUTOR!=='1','set E2E_TUTOR=1 to spend one guest question');
 const response=await ask(request,{question:'Apakah maksud nasionalisme?',form_level:4,subject:'sejarah'});
 expect(response.status()).toBe(200);
 const body=await response.json();
 expect(body.text.length).toBeGreaterThan(20);
 expect(body.source).toBeTruthy();
 expect(body.source.form).toBe('Form 4');
 expect(body.source.page).toBeGreaterThan(0);
 expect(body.source.chunk_id).toBeTruthy();
 expect(body.source.snippet.length).toBeGreaterThan(0);
});

test('labels a question outside the textbook instead of citing a page',async({request})=>{
 test.skip(process.env.E2E_TUTOR!=='1','set E2E_TUTOR=1 to spend one guest question');
 const response=await ask(request,{question:'Siapakah pengasas syarikat Tesla?',form_level:4,subject:'sejarah'});
 expect(response.status()).toBe(200);
 const body=await response.json();
 console.log('out-of-textbook answer_source:',body.answer_source,'provider:',body.web_provider,'sources:',JSON.stringify(body.sources??null).slice(0,300));
 expect(['web','none']).toContain(body.answer_source);
 expect(body.source).toBeNull();
 if(body.answer_source==='web')expect(body.sources.some((s:{kind:string;url?:string})=>s.kind==='web'&&s.url?.startsWith('https://'))).toBe(true);
});

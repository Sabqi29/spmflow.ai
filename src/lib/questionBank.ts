import catalog from '../data/question-set-catalog.json';

export type QuestionSet={id:string;year:number;title:string;paper:string;questions:number;sourceUrl:string};
export type PastQuestion={
 id:string;
 source:{year:number;state:string;district:string;paper:string;paper_key:string};
 question_number:number;
 question:string;
 options:Record<'A'|'B'|'C'|'D',string>;
 answer:'A'|'B'|'C'|'D';
};

export const questionSets=catalog as QuestionSet[];

export async function loadQuestionSet(id:string){
 const module=await import('../data/paper_1_dataset.json');
 const questions=(module.default as PastQuestion[]).filter(question=>question.source.paper_key===id);
 return questions.sort((a,b)=>a.question_number-b.question_number);
}

export function getQuestionSet(id:string){return questionSets.find(set=>set.id===id)}

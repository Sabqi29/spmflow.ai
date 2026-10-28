export const CHOICES=['A','B','C','D'] as const;
/* Some trial questions carry numbered statements (I–IV) or a matching table inside `options`; only A–D are answer choices. */
export function splitOptions(options:Record<string,string>){
 const choices=CHOICES.filter(key=>key in options).map(key=>[key,options[key]] as [string,string]);
 const statements=Object.entries(options).filter(([key])=>!(CHOICES as readonly string[]).includes(key));
 return{choices,statements};
}

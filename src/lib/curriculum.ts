export const subjects=['Sejarah','Biologi','Kimia','Fizik'] as const;

export const sejarahChapters:Record<number,string[]>={
 4:[
  'Bab 1 · Warisan Negara Bangsa',
  'Bab 2 · Kebangkitan Nasionalisme',
  'Bab 3 · Konflik Dunia dan Pendudukan Jepun di Negara Kita',
  'Bab 4 · Era Peralihan Kuasa British di Negara Kita',
  'Bab 5 · Persekutuan Tanah Melayu 1948',
  'Bab 6 · Ancaman Komunis dan Perisytiharan Darurat',
  'Bab 7 · Usaha ke Arah Kemerdekaan',
  'Bab 8 · Pilihan Raya',
  'Bab 9 · Perlembagaan Persekutuan Tanah Melayu 1957',
  'Bab 10 · Pemasyhuran Kemerdekaan'
 ],
 5:[
  'Bab 1 · Kedaulatan Negara',
  'Bab 2 · Perlembagaan Persekutuan',
  'Bab 3 · Raja Berperlembagaan dan Demokrasi Berparlimen',
  'Bab 4 · Sistem Persekutuan',
  'Bab 5 · Pembentukan Malaysia',
  'Bab 6 · Cabaran Selepas Pembentukan Malaysia',
  'Bab 7 · Membina Kesejahteraan Negara',
  'Bab 8 · Membina Kemakmuran Negara',
  'Bab 9 · Dasar Luar Malaysia',
  'Bab 10 · Kecemerlangan Malaysia di Persada Dunia'
 ]
};

export function chapterOptions(subject:string,form:number){
 if(subject==='Sejarah')return sejarahChapters[form]??[];
 const count=subject==='Biologi'?15:subject==='Kimia'?8:7;
 return Array.from({length:count},(_,index)=>`Bab ${index+1}`);
}

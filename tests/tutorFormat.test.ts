import {describe,expect,it} from 'vitest';
import {buildFlowMap,parseAnswer,parseInline,plainText} from '../src/lib/tutorFormat';

const answer=`Pentadbiran Kesultanan Melayu Melaka dibahagikan kepada dua peringkat, iaitu peringkat pusat dan jajahan.

### Isi penting
1. **Peringkat Pusat:**
   - **Sultan** mengetuai pemerintahan tertinggi.
   - Sultan dibantu oleh **Pembesar Berempat**, iaitu **Bendahara**, **Temenggung** dan **Laksamana**.
2. **Peringkat Jajahan:** diketuai oleh pembesar jajahan.

### Cara ingat
Akronim **BPTL**: Bendahara, Penghulu Bendahari, Temenggung, Laksamana.

### Tip SPM
Nyatakan isi dan beri satu huraian bagi setiap isi.`;

describe('tutor answer formatting',()=>{
 it('parses headings, ordered lists and nested bullets',()=>{
  const blocks=parseAnswer(answer);
  expect(blocks.map(b=>b.type)).toEqual(['para','heading','list','heading','para','heading','para']);
  const list=blocks[2];
  if(list.type!=='list')throw new Error('expected list');
  expect(list.ordered).toBe(true);
  expect(list.items).toHaveLength(2);
  expect(list.items[0].children).toHaveLength(2);
 });

 it('handles the old unstructured answers with 2-space nested dashes',()=>{
  const blocks=parseAnswer('Intro.\n\n1. **Peringkat Pusat:**\n  - **Sultan** ketua.\n  - Dibantu pembesar.');
  const list=blocks[1];
  if(list.type!=='list')throw new Error('expected list');
  expect(list.items[0].children.map(c=>c.text)).toEqual(['**Sultan** ketua.','Dibantu pembesar.']);
 });

 it('splits bold and italic runs and leaves stray asterisks alone',()=>{
  expect(parseInline('**Sultan** mengetuai *kerajaan*')).toEqual([{text:'Sultan',bold:true},{text:' mengetuai '},{text:'kerajaan',italic:true}]);
  expect(plainText('5 * 3 = 15 dan **tebal')).toBe('5 * 3 = 15 dan **tebal');
 });

 it('builds a flow map with the key points and both tips',()=>{
  const map=buildFlowMap(answer,'Terangkan pentadbiran Melaka?');
  expect(map?.topic).toBe('Terangkan pentadbiran Melaka');
  expect(map?.branches.map(b=>b.title)).toEqual(['Peringkat Pusat','Peringkat Jajahan']);
  expect(map?.branches[0].details[0]).toBe('Sultan mengetuai pemerintahan tertinggi.');
  expect(map?.branches[1].details).toEqual(['diketuai oleh pembesar jajahan.']);
  expect(map?.tips.map(t=>t.label)).toEqual(['Cara ingat','Tip SPM']);
 });

 it('skips the map for short answers without a list',()=>{
  expect(buildFlowMap('Nasionalisme ialah semangat cinta akan tanah air.')).toBeNull();
 });
});

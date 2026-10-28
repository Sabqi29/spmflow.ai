/* Retro ink illustration: a pencil rocket lifting off on a cloud of smoke, with the sun behind it. */
export default function PencilRocket(){return <svg className="pencil-rocket" viewBox="0 0 260 300" role="img" aria-label="Roket pensel berlepas">
 <g stroke="#1d1d37" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
  <g className="pr-sun"><circle cx="214" cy="44" r="22" fill="#ffc53d"/>{Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return <path key={i} d={`M${214+Math.cos(a)*29} ${44+Math.sin(a)*29}L${214+Math.cos(a)*36} ${44+Math.sin(a)*36}`} stroke="#e8482c"/>})}</g>
  <g className="pr-rocket">
   <path d="M108 70 130 22l22 48z" fill="#f6d1a3"/><path d="M123 37 130 22l7 15z" fill="#1d1d37"/>
   <path d="M108 70h44v96h-44z" fill="#ffc53d"/><path d="M123 70v96M137 70v96" strokeWidth="2.2"/>
   <circle cx="130" cy="104" r="11" fill="#fdf9f6"/><circle cx="130" cy="104" r="5" fill="#e8482c" stroke="none"/>
   <path d="M108 128 86 156v18l22-12zM152 128l22 28v18l-22-12z" fill="#e8482c"/>
   <path d="M108 166h44v14h-44z" fill="#cfc4bd"/><path d="M108 173h44" strokeWidth="2"/>
   <path d="M112 180h36v12a6 6 0 0 1-6 6h-24a6 6 0 0 1-6-6z" fill="#f59a8a"/>
   <g className="pr-flame"><path d="M116 200c-2 18 6 28 14 40 8-12 16-22 14-40z" fill="#e8482c"/><path d="M123 202c0 12 3 18 7 26 4-8 7-14 7-26z" fill="#ffc53d" strokeWidth="2"/></g>
  </g>
  <g className="pr-smoke">
   <circle cx="78" cy="262" r="26" fill="#e8482c"/><circle cx="182" cy="262" r="26" fill="#e8482c"/>
   <circle cx="110" cy="248" r="24" fill="#ffc53d"/><circle cx="150" cy="248" r="24" fill="#ffc53d"/>
   <circle cx="130" cy="268" r="28" fill="#fdf9f6"/><circle cx="46" cy="280" r="20" fill="#ffc53d"/><circle cx="214" cy="280" r="20" fill="#ffc53d"/>
   <circle cx="96" cy="284" r="20" fill="#fdf9f6"/><circle cx="164" cy="284" r="20" fill="#fdf9f6"/>
  </g>
  <path d="M30 70l4 9 9 4-9 4-4 9-4-9-9-4 9-4zM60 30l2.5 5.5 5.5 2.5-5.5 2.5L60 46l-2.5-5.5L52 38l5.5-2.5z" fill="#fdf9f6" strokeWidth="2.4"/>
 </g>
</svg>}

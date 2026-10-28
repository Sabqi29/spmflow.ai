/* Brand lockup: Deen's chrome knot + "spmflow" wordmark. `light` is the white-text version for navy headers. */
export default function Logo({light=false,height=34}:{light?:boolean;height?:number}){return <img className="logo-mark" src={light?'/assets/brand/spmflow-logo-light.webp':'/assets/brand/spmflow-logo.webp'} alt="spmflow" height={height} style={{height,width:'auto',display:'block'}}/>}

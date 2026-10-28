import {Routes,Route,useLocation} from 'react-router-dom';
import {useEffect} from 'react';
import {AppProvider} from './lib/context';
import Header from './components/Header';
import AuthModal from './components/AuthModal';
import Landing from './pages/Landing';
import Study from './pages/Study';
import Pricing from './pages/Pricing';
import Legal from './pages/Legal';
import Dashboard from './pages/Dashboard';
import Notes from './pages/Notes';
import Classes from './pages/Classes';
import Practice from './pages/Practice';
import Home from './pages/Home';
import Guide from './pages/Guide';
import Review from './pages/Review';
function Scroll(){const {pathname,hash}=useLocation();useEffect(()=>{if(hash){setTimeout(()=>document.getElementById(hash.slice(1))?.scrollIntoView(),50)}else window.scrollTo(0,0)},[pathname,hash]);return null}
/* Per-page titles and descriptions so search engines can tell the public pages apart. */
const pageMeta:Record<string,[string,string]>={
 '/':['SPMFlow — Tutor AI Sejarah SPM | Faham hari ini. Yakin esok.','Baca buku teks, fahami bersama tutor AI dan berlatih untuk SPM. Mulakan dengan Sejarah Tingkatan 4 dan 5.'],
 '/belajar':['Ruang Belajar Sejarah SPM — buku teks & tutor AI | SPMFlow','Buka buku teks Sejarah Tingkatan 4 dan 5 di sebelah tutor AI yang menjawab berdasarkan buku teks, dengan rujukan muka surat.'],
 '/panduan':['Panduan Ulang Kaji Sejarah SPM mengikut bab | SPMFlow','Lihat bab Sejarah yang paling kerap keluar dalam soalan percubaan SPM dan mula ulang kaji dari situ.'],
 '/nota':['Nota Sejarah SPM dikongsi pelajar | SPMFlow','Baca dan kongsi nota Sejarah SPM Tingkatan 4 dan 5 mengikut bab.'],
 '/harga':['Harga | SPMFlow','Mula percuma. Pelan untuk pelajar dan sekolah.'],
 '/privasi':['Dasar Privasi | SPMFlow','Bagaimana SPMFlow menyimpan dan melindungi data pelajar.'],
 '/terma':['Terma Penggunaan | SPMFlow','Terma penggunaan SPMFlow.'],
};
function usePageMeta(pathname:string){useEffect(()=>{const [title,description]=pageMeta[pathname]||pageMeta['/'];document.title=title;document.querySelector('meta[name="description"]')?.setAttribute('content',description);document.querySelector('link[rel="canonical"]')?.setAttribute('href',`${location.origin}${pathname in pageMeta?pathname:'/'}`)},[pathname])}
function Shell(){const {pathname}=useLocation();usePageMeta(pathname);const locked=pathname.startsWith('/latihan/');return <><Scroll/>{!locked&&<Header/>}<Routes><Route path="/" element={<Landing/>}/><Route path="/utama" element={<Home/>}/><Route path="/panduan" element={<Guide/>}/><Route path="/semakan" element={<Review/>}/><Route path="/belajar" element={<Study/>}/><Route path="/latihan/:setId" element={<Practice/>}/><Route path="/dashboard" element={<Dashboard/>}/><Route path="/nota" element={<Notes/>}/><Route path="/kelas" element={<Classes/>}/><Route path="/harga" element={<Pricing/>}/><Route path="/privasi" element={<Legal/>}/><Route path="/terma" element={<Legal terms/>}/><Route path="*" element={<main className="section"><h1>404</h1><a href="/">Kembali ke spmflow.ai</a></main>}/></Routes><AuthModal/></>}
export default function App(){return <AppProvider><Shell/></AppProvider>}

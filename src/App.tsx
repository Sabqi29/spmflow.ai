import {Routes,Route,useLocation} from 'react-router-dom';
import {useEffect} from 'react';
import {AppProvider} from './lib/context';
import Header from './components/Header';
import AuthModal from './components/AuthModal';
import Landing from './pages/Landing';
import Study from './pages/Study';
import Pricing from './pages/Pricing';
import Legal from './pages/Legal';
function Scroll(){const {pathname,hash}=useLocation();useEffect(()=>{if(hash){setTimeout(()=>document.getElementById(hash.slice(1))?.scrollIntoView(),50)}else window.scrollTo(0,0)},[pathname,hash]);return null}
export default function App(){return <AppProvider><Scroll/><Header/><Routes><Route path="/" element={<Landing/>}/><Route path="/belajar" element={<Study/>}/><Route path="/harga" element={<Pricing/>}/><Route path="/privasi" element={<Legal/>}/><Route path="/terma" element={<Legal terms/>}/><Route path="*" element={<main className="section"><h1>404</h1><a href="/">Kembali ke spmflow.ai</a></main>}/></Routes><AuthModal/></AppProvider>}

import {createContext,useContext,useEffect,useState,ReactNode} from 'react';
import type {User} from '@supabase/supabase-js';
import {supabase} from './api';
type Context={lang:'bm'|'en';setLang:(l:'bm'|'en')=>void;t:(bm:string,en:string)=>string;user:User|null;authOpen:boolean;setAuthOpen:(open:boolean)=>void;authMode:'login'|'signup'|'reset'|'recovery';setAuthMode:(mode:'login'|'signup'|'reset'|'recovery')=>void};
const AppContext=createContext<Context>(null!);
export function AppProvider({children}:{children:ReactNode}){
 const [lang,setLang]=useState<'bm'|'en'>(()=>localStorage.getItem('spmflow-language')==='en'?'en':'bm');
 const [user,setUser]=useState<User|null>(null);const [authOpen,setAuthOpen]=useState(false);const [authMode,setAuthMode]=useState<Context['authMode']>('signup');
 useEffect(()=>{document.documentElement.lang=lang==='bm'?'ms':'en';localStorage.setItem('spmflow-language',lang)},[lang]);
 useEffect(()=>{supabase.auth.getSession().then(({data})=>setUser(data.session?.user||null));const {data}=supabase.auth.onAuthStateChange((event,session)=>{setUser(session?.user||null);if(event==='PASSWORD_RECOVERY'){setAuthMode('recovery');setAuthOpen(true);}});return()=>data.subscription.unsubscribe()},[]);
 return <AppContext.Provider value={{lang,setLang,t:(bm,en)=>lang==='bm'?bm:en,user,authOpen,setAuthOpen,authMode,setAuthMode}}>{children}</AppContext.Provider>;
}
// This hook intentionally shares the provider module; it is not a component.
// eslint-disable-next-line react-refresh/only-export-components
export const useApp=()=>useContext(AppContext);

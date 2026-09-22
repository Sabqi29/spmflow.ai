import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
export default defineConfig({plugins:[react()],resolve:{alias:{'@':path.resolve(__dirname,'./src')}},server:{host:'127.0.0.1',port:5173,strictPort:true},build:{rollupOptions:{output:{manualChunks:{vendor:['react','react-dom','react-router-dom'],supabase:['@supabase/supabase-js']}}}}});

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { AlertCircle, BookOpen, LoaderCircle } from 'lucide-react';
import { getTextbook, type Source, type Textbook } from '../lib/api';

type Props = {
  form: number;
  printedPage: number;
  zoom: number;
  source: Source | null;
  t: (bm: string, en: string) => string;
};

export default function TextbookViewer({ form, printedPage, zoom, source, t }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const pageRef = useRef<PDFPageProxy | null>(null);
  const renderRef = useRef<RenderTask | null>(null);
  const [textbook, setTextbook] = useState<Textbook | null>(null);
  const [loadingBook, setLoadingBook] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');
  const [hostWidth, setHostWidth] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => setHostWidth(entry.contentRect.width));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof import('pdfjs-dist').getDocument> | null = null;
    setLoadingBook(true);
    setError('');
    setTextbook(null);

    async function load() {
      try {
        const [metadata, pdfjs] = await Promise.all([getTextbook(form), import('pdfjs-dist')]);
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        loadingTask = pdfjs.getDocument({ url: metadata.url, rangeChunkSize: 1024 * 1024 });
        const document = await loadingTask.promise;
        if (cancelled) return;
        documentRef.current = document;
        setTextbook(metadata);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Textbook failed to load.');
      } finally {
        if (!cancelled) setLoadingBook(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      renderRef.current?.cancel();
      pageRef.current?.cleanup();
      pageRef.current = null;
      documentRef.current = null;
      void loadingTask?.destroy();
    };
  }, [form]);

  useEffect(() => {
    const document = documentRef.current;
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!document || !canvas || !hostWidth || !textbook) return;

    let cancelled = false;
    setRendering(true);
    async function renderPage() {
      const pdfPage = Math.min(document!.numPages, Math.max(1, printedPage + textbook!.printed_page_offset));
      const page = await document!.getPage(pdfPage);
      if (cancelled) return;
      pageRef.current?.cleanup();
      pageRef.current = page;
      const unscaled = page.getViewport({ scale: 1 });
      const cssScale = Math.max(0.2, ((host!.clientWidth - 32) / unscaled.width) * (zoom / 100));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: cssScale * dpr });
      canvas!.width = Math.floor(viewport.width);
      canvas!.height = Math.floor(viewport.height);
      canvas!.style.width = `${viewport.width / dpr}px`;
      canvas!.style.height = `${viewport.height / dpr}px`;
      const context = canvas!.getContext('2d', { alpha: false });
      if (!context) throw new Error('Canvas is not available.');
      renderRef.current?.cancel();
      const task = page.render({ canvas: canvas!, canvasContext: context, viewport });
      renderRef.current = task;
      try {
        await task.promise;
        if (!cancelled) setRendering(false);
      } catch (caught) {
        if (!cancelled && !(caught instanceof Error && caught.name === 'RenderingCancelledException')) {
          setError(t('Halaman buku gagal dipaparkan.', 'The textbook page could not be rendered.'));
          setRendering(false);
        }
      }
    }

    void renderPage();
    return () => {
      cancelled = true;
      renderRef.current?.cancel();
    };
  }, [hostWidth, printedPage, textbook, t, zoom]);

  return (
    <div ref={hostRef} className="pdf-viewer" aria-live="polite">
      {loadingBook ? (
        <div className="pdf-state"><LoaderCircle className="spin"/><strong>{t('Membuka buku teks…','Opening textbook…')}</strong></div>
      ) : error ? (
        <div className="pdf-state error" role="alert"><AlertCircle/><strong>{t('Buku teks belum dapat dibuka.','The textbook cannot be opened yet.')}</strong><p>{error}</p></div>
      ) : (
        <>
          {rendering ? <div className="pdf-rendering"><LoaderCircle className="spin"/>{t('Memaparkan halaman…','Rendering page…')}</div> : null}
          <canvas ref={canvasRef} aria-label={`${textbook?.title}, ${t('muka surat','page')} ${printedPage}`} />
          {source ? <div className="pdf-source-banner"><BookOpen size={14}/><span><strong>{t('Sumber jawapan tutor','Tutor answer source')}</strong>{source.section_title ? ` · ${source.section_title}` : ''}</span></div> : null}
        </>
      )}
    </div>
  );
}

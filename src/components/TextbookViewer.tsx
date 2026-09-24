import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import HTMLFlipBook from 'react-pageflip-enhanced';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import '../textbook-reader.css';
import {
  AlertCircle, BookOpen, ChevronLeft, ChevronRight, Download, LayoutGrid,
  LoaderCircle, Maximize2, Minimize2, ZoomIn, ZoomOut,
} from 'lucide-react';
import { getTextbook, type Source, type Textbook } from '../lib/api';

type Props = {
  form: number;
  printedPage: number;
  source: Source | null;
  onPrintedPageChange: (page: number) => void;
  t: (bm: string, en: string) => string;
};

type FlipBookApi = {
  pageFlip: () => { flip: (page: number) => void; turnToPage: (page: number) => void };
};

const RENDER_WINDOW = 3;
const THUMB_WIDTH = 82;
const THUMB_BUFFER = 6;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 0.1;

export default function TextbookViewer({ form, printedPage, source, onPrintedPageChange, t }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<FlipBookApi | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [textbook, setTextbook] = useState<Textbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [size, setSize] = useState({ width: 760, height: 520 });
  const [pageSize, setPageSize] = useState({ width: 595, height: 842 });
  const [pageInput, setPageInput] = useState(String(printedPage));

  const offset = textbook?.printed_page_offset ?? (form === 4 ? 8 : 10);
  const totalPdfPages = pdfDoc?.numPages ?? textbook?.pdf_page_count ?? 0;
  const totalPrintedPages = Math.max(1, totalPdfPages - offset);
  const isTwoPage = size.width >= 620;
  const currentPrintedPage = currentPdfPage > offset ? currentPdfPage - offset : null;

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof import('pdfjs-dist').getDocument> | null = null;
    setLoading(true);
    setError('');
    setPdfDoc(null);
    setTextbook(null);

    async function loadBook() {
      try {
        const [metadata, pdfjs] = await Promise.all([getTextbook(form), import('pdfjs-dist')]);
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        loadingTask = pdfjs.getDocument({ url: metadata.url, rangeChunkSize: 1024 * 1024 });
        const document = await loadingTask.promise;
        const firstPage = await document.getPage(1);
        if (cancelled) return;
        const firstViewport = firstPage.getViewport({ scale: 1 });
        const initialPdfPage = clamp(printedPage + metadata.printed_page_offset, 1, document.numPages);
        setPageSize({ width: firstViewport.width, height: firstViewport.height });
        setTextbook(metadata);
        setPdfDoc(document);
        setCurrentPdfPage(initialPdfPage);
        setPageInput(String(printedPage));
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Textbook failed to load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadBook();
    return () => { cancelled = true; void loadingTask?.destroy(); };
    // Switching form intentionally creates a fresh signed URL and PDF document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => {
      const rect = viewport.getBoundingClientRect();
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      setSize((previous) => previous.width === next.width && previous.height === next.height ? previous : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [loading]);

  const goToPdfPage = useCallback((pdfPage: number) => {
    if (!totalPdfPages) return;
    const target = clamp(pdfPage, 1, totalPdfPages);
    const pageFlip = bookRef.current?.pageFlip();
    if (pageFlip) {
      if (Math.abs(target - currentPdfPage) <= 1) pageFlip.flip(target - 1);
      else pageFlip.turnToPage(target - 1);
    }
    setCurrentPdfPage(target);
    const printed = target - offset;
    if (printed >= 1 && printed <= totalPrintedPages) onPrintedPageChange(printed);
  }, [currentPdfPage, offset, onPrintedPageChange, totalPdfPages, totalPrintedPages]);

  useEffect(() => {
    if (!pdfDoc || !textbook) return;
    const target = clamp(printedPage + textbook.printed_page_offset, 1, pdfDoc.numPages);
    if (target !== currentPdfPage) goToPdfPage(target);
    setPageInput(String(printedPage));
  }, [currentPdfPage, goToPdfPage, pdfDoc, printedPage, textbook]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') goToPdfPage(currentPdfPage - 1);
      if (event.key === 'ArrowRight' || event.key === 'PageDown') goToPdfPage(currentPdfPage + 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentPdfPage, goToPdfPage]);

  function commitPageInput() {
    const requested = Number(pageInput);
    if (Number.isFinite(requested)) goToPdfPage(clamp(requested, 1, totalPrintedPages) + offset);
    else setPageInput(String(currentPrintedPage ?? printedPage));
  }

  const availableWidth = Math.max(size.width - 28, 240);
  const availableHeight = Math.max(size.height - 28, 280);
  let basePageWidth = isTwoPage ? availableWidth / 2 : availableWidth;
  let basePageHeight = (basePageWidth * pageSize.height) / pageSize.width;
  if (basePageHeight > availableHeight) {
    basePageHeight = availableHeight;
    basePageWidth = (basePageHeight * pageSize.width) / pageSize.height;
  }
  const pageWidth = Math.round(basePageWidth * zoom);
  const pageHeight = Math.round(basePageHeight * zoom);
  const renderScale = Math.max(0.1, pageWidth / pageSize.width);
  const sizeKey = `${form}-${isTwoPage ? 'spread' : 'single'}-${Math.round(pageWidth / 4) * 4}x${Math.round(pageHeight / 4) * 4}`;

  if (loading) return <div className="pdf-state"><LoaderCircle className="spin"/><strong>{t('Membuka buku teks…','Opening textbook…')}</strong></div>;
  if (error || !pdfDoc || !textbook) return <div className="pdf-state error" role="alert"><AlertCircle/><strong>{t('Buku teks belum dapat dibuka.','The textbook cannot be opened yet.')}</strong><p>{error}</p></div>;

  return (
    <div ref={rootRef} className="textbook-reader" aria-label={textbook.title}>
      <div className="reader-toolbar">
        <button className="reader-icon" onClick={() => goToPdfPage(currentPdfPage - 1)} disabled={currentPdfPage <= 1} aria-label={t('Halaman sebelumnya','Previous page')}><ChevronLeft/></button>
        <button className="reader-icon" onClick={() => goToPdfPage(currentPdfPage + 1)} disabled={currentPdfPage >= totalPdfPages} aria-label={t('Halaman seterusnya','Next page')}><ChevronRight/></button>
        <form className="reader-page-input" onSubmit={(event) => { event.preventDefault(); commitPageInput(); }}>
          <input value={pageInput} onChange={(event) => setPageInput(event.target.value)} onBlur={commitPageInput} onFocus={(event) => event.currentTarget.select()} inputMode="numeric" aria-label={t('Pergi ke muka surat','Go to page')}/>
          <span>{t('m.s.','p.')} · {totalPrintedPages}</span>
        </form>
        <span className="reader-divider"/>
        <button className="reader-icon" onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))} disabled={zoom <= MIN_ZOOM} aria-label={t('Zum keluar','Zoom out')}><ZoomOut/></button>
        <span className="reader-zoom">{Math.round(zoom * 100)}%</span>
        <button className="reader-icon" onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))} disabled={zoom >= MAX_ZOOM} aria-label={t('Zum masuk','Zoom in')}><ZoomIn/></button>
        <span className="reader-divider"/>
        <button className={`reader-icon ${showThumbnails ? 'active' : ''}`} onClick={() => setShowThumbnails((value) => !value)} aria-label={t('Paparkan thumbnail','Show thumbnails')}><LayoutGrid/></button>
        <button className="reader-icon" onClick={() => document.fullscreenElement ? void document.exitFullscreen() : void rootRef.current?.requestFullscreen()} aria-label={t('Skrin penuh','Fullscreen')}>{isFullscreen ? <Minimize2/> : <Maximize2/>}</button>
        <a className="reader-icon" href={textbook.url} download={`sejarah-tingkatan-${form}.pdf`} aria-label={t('Muat turun buku','Download textbook')}><Download/></a>
      </div>

      <div ref={viewportRef} className="reader-viewport">
        <div className="reader-book-frame" style={{ width: pageWidth * (isTwoPage ? 2 : 1), height: pageHeight }}>
          <TextbookFlipbook key={sizeKey} bookRef={bookRef} pdfDoc={pdfDoc} numPages={totalPdfPages} initialPage={currentPdfPage} pageWidth={pageWidth} pageHeight={pageHeight} scale={renderScale} singlePage={!isTwoPage}
            onPageChange={(pdfPage) => {
              setCurrentPdfPage(pdfPage);
              const printed = pdfPage - offset;
              if (printed >= 1 && printed <= totalPrintedPages) { setPageInput(String(printed)); onPrintedPageChange(printed); }
            }}
            onFlippingChange={setIsFlipping}/>
          {isTwoPage ? <span className="reader-book-spine" style={{ opacity: isFlipping ? 0 : 1 }}/> : null}
        </div>
        {source ? <div className="pdf-source-banner"><BookOpen size={14}/><span><strong>{t('Sumber jawapan tutor','Tutor answer source')}</strong>{source.section_title ? ` · ${source.section_title}` : ''}</span></div> : null}
      </div>

      <div className="reader-scrubber">
        <span>{currentPrintedPage ? `${t('Muka surat','Page')} ${currentPrintedPage}` : t('Bahagian awal','Front matter')}</span>
        <input type="range" min={1} max={totalPdfPages} value={currentPdfPage} onChange={(event) => goToPdfPage(Number(event.target.value))} aria-label={t('Navigasi muka surat','Page navigation')}/>
        <span>{currentPdfPage} / {totalPdfPages}</span>
      </div>
      {showThumbnails ? <ThumbnailRail pdfDoc={pdfDoc} numPages={totalPdfPages} currentPage={currentPdfPage} offset={offset} onSelect={goToPdfPage}/> : null}
    </div>
  );
}

function TextbookFlipbook({ bookRef, pdfDoc, numPages, initialPage, pageWidth, pageHeight, scale, singlePage, onPageChange, onFlippingChange }: {
  bookRef: MutableRefObject<FlipBookApi | null>; pdfDoc: PDFDocumentProxy; numPages: number; initialPage: number;
  pageWidth: number; pageHeight: number; scale: number; singlePage: boolean;
  onPageChange: (page: number) => void; onFlippingChange: (flipping: boolean) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialPage - 1);
  const activePages = useMemo(() => {
    const pages = new Set<number>();
    for (let page = currentIndex + 1 - RENDER_WINDOW; page <= currentIndex + 1 + RENDER_WINDOW; page += 1) if (page >= 1 && page <= numPages) pages.add(page);
    return pages;
  }, [currentIndex, numPages]);
  const pages = useMemo(() => Array.from({ length: numPages }, (_, index) => {
    const pageNumber = index + 1;
    return <PdfPageCanvas key={pageNumber} pdfDoc={pdfDoc} pageNumber={pageNumber} active={activePages.has(pageNumber)} scale={scale}/>;
  }), [activePages, numPages, pdfDoc, scale]);

  return <HTMLFlipBook
    ref={bookRef as any}
    width={pageWidth} height={pageHeight} size="fixed" minWidth={180} maxWidth={2000} minHeight={250} maxHeight={2800}
    maxShadowOpacity={0.42} showCover={false} singlePage={singlePage} mobileScrollSupport startPage={initialPage - 1}
    onFlip={(event: { data: number }) => { setCurrentIndex(event.data); onPageChange(event.data + 1); }}
    onChangeState={(event: { data: string }) => onFlippingChange(event.data !== 'read')} className="reader-flipbook">
    {pages}
  </HTMLFlipBook>;
}

const PdfPageCanvas = forwardRef<HTMLDivElement, { pdfDoc: PDFDocumentProxy; pageNumber: number; active: boolean; scale: number }>(
  function PdfPageCanvas({ pdfDoc, pageNumber, active, scale }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderRef = useRef<RenderTask | null>(null);
    const [rendered, setRendered] = useState(false);
    useEffect(() => {
      if (!active) {
        setRendered(false);
        const canvas = canvasRef.current;
        if (canvas) { canvas.width = 0; canvas.height = 0; }
        return;
      }
      let cancelled = false;
      async function render() {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: scale * dpr });
        canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${viewport.width / dpr}px`; canvas.style.height = `${viewport.height / dpr}px`;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) return;
        renderRef.current?.cancel();
        const task = page.render({ canvas, canvasContext: context, viewport });
        renderRef.current = task;
        try { await task.promise; if (!cancelled) setRendered(true); }
        catch (caught) { if (!cancelled && !(caught instanceof Error && caught.name === 'RenderingCancelledException')) console.error(`Failed to render page ${pageNumber}`, caught); }
      }
      void render();
      return () => { cancelled = true; renderRef.current?.cancel(); };
    }, [active, pageNumber, pdfDoc, scale]);
    return <div ref={ref} className="reader-page">{!rendered ? <span className="reader-page-loading" aria-hidden/> : null}<canvas ref={canvasRef}/></div>;
  }
);

function ThumbnailRail({ pdfDoc, numPages, currentPage, offset, onSelect }: { pdfDoc: PDFDocumentProxy; numPages: number; currentPage: number; offset: number; onSelect: (page: number) => void }) {
  const railRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [range, setRange] = useState({ start: 1, end: Math.min(20, numPages) });
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const update = () => setRange({ start: Math.max(1, Math.floor(rail.scrollLeft / THUMB_WIDTH) - THUMB_BUFFER), end: Math.min(numPages, Math.ceil((rail.scrollLeft + rail.clientWidth) / THUMB_WIDTH) + THUMB_BUFFER) });
    update(); rail.addEventListener('scroll', update, { passive: true }); window.addEventListener('resize', update);
    return () => { rail.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [numPages]);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }, [currentPage]);
  return <div ref={railRef} className="reader-thumbnails">{Array.from({ length: numPages }, (_, index) => {
    const page = index + 1; const printed = page > offset ? page - offset : null; const visible = page >= range.start && page <= range.end;
    return <button key={page} ref={page === currentPage ? activeRef : undefined} className={page === currentPage ? 'active' : ''} onClick={() => onSelect(page)} aria-label={printed ? `Muka surat ${printed}` : `PDF ${page}`}>
      <span className="reader-thumbnail-canvas">{visible ? <ThumbnailCanvas pdfDoc={pdfDoc} pageNumber={page}/> : null}</span><small>{printed ?? '—'}</small>
    </button>;
  })}</div>;
}

function ThumbnailCanvas({ pdfDoc, pageNumber }: { pdfDoc: PDFDocumentProxy; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false; let task: RenderTask | null = null;
    async function render() {
      const canvas = canvasRef.current; if (!canvas) return;
      const page = await pdfDoc.getPage(pageNumber); if (cancelled) return;
      const viewport = page.getViewport({ scale: 0.13 }); canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext('2d', { alpha: false }); if (!context) return;
      task = page.render({ canvas, canvasContext: context, viewport });
      try { await task.promise; } catch { /* Thumbnail left the visible range. */ }
    }
    void render(); return () => { cancelled = true; task?.cancel(); };
  }, [pageNumber, pdfDoc]);
  return <canvas ref={canvasRef}/>;
}

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

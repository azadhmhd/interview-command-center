'use client';
import { useEffect, useState } from 'react';
import { ResumePages } from '@/components/resume/resume-pages';
import { DEFAULT_DESIGN, PAGE, type ResumeContent, type ResumeDesign } from '@/lib/resume';

declare global {
  interface Window { __RESUME__?: { content: ResumeContent; design: ResumeDesign; title?: string }; RENDER_DONE?: boolean; PAGE_COUNT?: number }
}

/**
 * Print target for the PDF renderer. It fetches nothing and needs no session: the API's headless browser injects the
 * resume as window.__RESUME__ before load, waits for RENDER_DONE, then prints. Opened directly it renders nothing.
 */
export default function PrintResume() {
  const [data, setData] = useState<Window['__RESUME__'] | null>(null);
  useEffect(() => {
    const d = window.__RESUME__ ?? null;
    if (d) document.title = d.content.header.fullName ? `${d.content.header.fullName} Resume` : d.title || 'Resume'; // becomes the PDF's title
    setData(d);
  }, []);
  if (!data) return null;
  const design = { ...DEFAULT_DESIGN, ...data.design };
  const size = (PAGE[design.pageFormat] ?? PAGE.A4).css;
  const [w, h] = size.split(' ');
  return (
    <>
      <style>{`@page { size: ${size}; margin: 0 }
html, body { margin: 0; padding: 0; background: #fff !important; }
.resume-page { width: ${w} !important; height: ${h} !important; break-after: page; box-shadow: none !important; }
.resume-page:last-child { break-after: auto; }
.resume-pages { align-items: flex-start !important; }
a { color: inherit; text-decoration: none; }
nextjs-portal { display: none !important; }`}</style>
      <ResumePages content={data.content} design={design} pageGap={0} onRendered={(n) => { window.PAGE_COUNT = n; window.RENDER_DONE = true; }} />
    </>
  );
}

import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import type { Browser } from 'playwright';
import { config } from '../config';
import type { ResumeContent, ResumeDesign } from './content';

declare const window: { __RESUME__?: unknown; RENDER_DONE?: boolean; PAGE_COUNT?: number };

/**
 * Resume → PDF with the same renderer as the editor preview: a headless Chromium opens the web app's /print/resume page,
 * the resume is injected before load (the page fetches nothing and needs no session), and the page is printed once it
 * signals RENDER_DONE. The page may only reach the web app's own origin, so links or URLs inside a resume can never make
 * the server fetch anything else.
 */
@Injectable()
export class PdfRenderer implements OnModuleDestroy {
  private log = new Logger(PdfRenderer.name);
  private browser: Promise<Browser> | null = null;
  private active = 0;
  private waiting: (() => void)[] = [];

  async render(data: { content: ResumeContent; design: ResumeDesign; title: string }): Promise<{ pdf: Buffer; pages: number }> {
    if (!config.pdf.enabled) throw new ServiceUnavailableException('PDF rendering is turned off (PDF_ENABLED=false)');
    // ponytail: at most 2 renders at once per API process; a render queue/worker if many users export together
    if (this.active >= 2) await new Promise<void>((r) => this.waiting.push(r));
    this.active++;
    const origin = new URL(config.pdf.webUrl).origin;
    let context;
    try {
      context = await (await this.launch()).newContext();
      await context.route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort()));
      const page = await context.newPage();
      await page.addInitScript((d) => { window.__RESUME__ = d; }, data);
      await page.goto(`${origin}/print/resume`, { waitUntil: 'load', timeout: config.pdf.timeoutMs });
      await page.waitForFunction(() => window.RENDER_DONE === true, null, { timeout: config.pdf.timeoutMs });
      const pages = await page.evaluate(() => window.PAGE_COUNT ?? 0);
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true });
      return { pdf, pages };
    } catch (e) {
      this.log.error(`PDF render failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException(`Could not render the PDF: is the web app reachable at ${origin}? (${(e as Error).message.split('\n')[0]})`);
    } finally {
      await context?.close().catch(() => undefined);
      this.active--;
      this.waiting.shift()?.();
    }
  }

  private launch(): Promise<Browser> {
    this.browser ??= import('playwright').then(async ({ chromium }) => {
      const b = await chromium.launch();
      b.on('disconnected', () => { this.browser = null; });
      return b;
    }).catch((e) => { this.browser = null; throw e; });
    return this.browser;
  }

  async onModuleDestroy() {
    const b = await this.browser?.catch(() => null);
    await b?.close().catch(() => undefined);
  }
}

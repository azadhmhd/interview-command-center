/**
 * Lifts the section-heading icons out of a resume PDF (e.g. a resume-builder export) so a re-built resume can show the
 * very same icons. They are kept in that user's draft design (their data), never bundled with the app: such icons are
 * often licensed artwork (e.g. FontAwesome Pro).
 */
import type { ResumeContent, Section } from './content';

export interface PdfIcon { title: string; viewBox: string; d: string }

/** pdf.js path data: 0 moveTo, 1 lineTo, 2 curveTo, 3 quadraticCurveTo, 4 closePath. */
export function pathDataToSvg(data: ArrayLike<number>): string {
  const n = (x: number) => +x.toFixed(2);
  const out: string[] = [];
  for (let i = 0; i < data.length;) {
    const op = data[i++];
    const take = (k: number) => Array.from({ length: k }, () => n(data[i++])).join(' ');
    if (op === 0) out.push(`M${take(2)}`);
    else if (op === 1) out.push(`L${take(2)}`);
    else if (op === 2) out.push(`C${take(6)}`);
    else if (op === 3) out.push(`Q${take(4)}`);
    else if (op === 4) out.push('Z');
    else break;
  }
  return out.join('');
}

/** Heading icons of every page, each with the heading text it stands next to. */
export async function extractHeadingIcons(pdf: Buffer): Promise<PdfIcon[]> {
  const { getDocumentProxy, getResolvedPDFJS } = await import('unpdf');
  const { OPS } = await getResolvedPDFJS();
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const icons: PdfIcon[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 10); p++) {
    const page = await doc.getPage(p);
    const ops = await page.getOperatorList();
    const height = page.getViewport({ scale: 1 }).height;
    const text = (await page.getTextContent()).items
      .filter((t) => 'str' in t && t.str.trim())
      .map((t) => ({ str: (t as { str: string }).str.trim(), x: (t as { transform: number[] }).transform[4], y: height - (t as { transform: number[] }).transform[5], size: Math.abs((t as { transform: number[] }).transform[3]) }));
    // Chrome/Skia PDFs: page CTM = 0.24 · 3.125 → 1 CSS px = 3.125 units of the transforms we see
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] !== OPS.transform) continue;
      const [a, b, c, d, e, f] = ops.argsArray[i] as number[];
      if (b || c || Math.abs(a - d) > 1e-6 || a < 0.05 || a > 0.2) continue;
      const pathOp = ops.fnArray.indexOf(OPS.constructPath, i);
      if (pathOp < 0 || pathOp - i > 8) continue;
      const [, [data], minMax] = ops.argsArray[pathOp] as [number, [ArrayLike<number>], ArrayLike<number>];
      if (!data || !minMax || minMax[2] - minMax[0] < 100) continue; // bullets and small marks
      // drawn 1em tall (58.33 units) in a 1.1em box: wide icons are squeezed to the box width instead
      const tall = 58.3333 / a;
      const widthBound = minMax[2] > tall * 1.05;
      const svgWidth = widthBound ? Math.ceil(minMax[2] / 64) * 64 : Math.max(Math.round(tall / 32) * 32, Math.ceil(minMax[2] / 64) * 64);
      const svgHeight = widthBound ? 512 : Math.round(tall / 32) * 32;
      const xPt = (e / 3.125) * 0.75, topPt = (f / 3.125) * 0.75;
      // heading text: same line (baseline ~0.75em under the icon top), to the right of the icon, largest font there
      const heading = text
        .filter((t) => t.x > xPt && t.x - xPt < 60 && t.y - topPt > 0 && t.y - topPt < 20)
        .sort((x, y) => y.size - x.size || x.x - y.x)[0];
      if (!heading) continue;
      icons.push({ title: heading.str, viewBox: `0 0 ${svgWidth} ${svgHeight}`, d: pathDataToSvg(data) });
      i = pathOp;
    }
  }
  return icons;
}

/** Match extracted icons to draft sections by heading title (case-insensitive). */
export function iconsForSections(content: ResumeContent, icons: PdfIcon[]): Partial<Record<Section['kind'], { viewBox: string; d: string }>> {
  const out: Partial<Record<Section['kind'], { viewBox: string; d: string }>> = {};
  for (const s of content.sections) {
    const icon = icons.find((i) => i.title.toLowerCase() === s.title.trim().toLowerCase());
    if (icon && !out[s.kind]) out[s.kind] = { viewBox: icon.viewBox, d: icon.d };
  }
  return out;
}

import { normalizeContent, resumeDesignSchema } from './content';
import { iconsForSections, pathDataToSvg } from './icons';

it('turns pdf.js path data back into SVG path commands', () => {
  expect(pathDataToSvg([0, 10, 20, 1, 30.123, 40, 2, 1, 2, 3, 4, 5, 6, 3, 7, 8, 9, 10, 4])).toBe('M10 20L30.12 40C1 2 3 4 5 6Q7 8 9 10Z');
  expect(pathDataToSvg([])).toBe('');
});

it('matches icons to sections by heading title', () => {
  const content = normalizeContent({ sections: [{ kind: 'skills', title: 'Skills' }, { kind: 'experience', title: 'Work Experience' }, { kind: 'summary', title: '' }] });
  const icons = iconsForSections(content, [
    { title: 'WORK EXPERIENCE', viewBox: '0 0 512 512', d: 'M0 0L1 1Z' },
    { title: 'SKILLS', viewBox: '0 0 512 512', d: 'M2 2Z' },
    { title: 'AWARDS', viewBox: '0 0 512 512', d: 'M3 3Z' },
  ]);
  expect(icons).toEqual({ experience: { viewBox: '0 0 512 512', d: 'M0 0L1 1Z' }, skills: { viewBox: '0 0 512 512', d: 'M2 2Z' } });
});

it('only accepts plain path data for stored icons', () => {
  expect(resumeDesignSchema.safeParse({ icons: { skills: { viewBox: '0 0 512 512', d: 'M10 20L30 40Z' } } }).success).toBe(true);
  expect(resumeDesignSchema.safeParse({ icons: { skills: { viewBox: '0 0 512 512', d: '"/><script>alert(1)</script>' } } }).success).toBe(false);
  expect(resumeDesignSchema.safeParse({ icons: { skills: { viewBox: 'javascript:1', d: 'M0 0Z' } } }).success).toBe(false);
  expect(resumeDesignSchema.safeParse({ icons: { nope: { viewBox: '0 0 512 512', d: 'M0 0Z' } } }).success).toBe(false);
});

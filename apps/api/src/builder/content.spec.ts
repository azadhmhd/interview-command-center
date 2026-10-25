import { applyTailoring, fromProfile, normalizeContent, safeUrl, toPlainText, toStructured } from './content';

const facts = {
  name: 'Sam Rivera', skills: ['Python', 'PostgreSQL'], education: ['B.Tech Computer Science, MES College, 2015 – 2019'], certifications: ['AWS SAA'],
  roles: [{ company: 'Acme', title: 'Backend Engineer', start: '2019', end: 'Present', highlights: ['Built the payments API', ' '] }],
};

it('builds a first resume from the profile and confirmed CV facts', () => {
  const c = fromProfile({ fullName: 'Sam R.', headline: 'Backend Engineer', summary: 'Seven years of Python.', coreTech: ['Go'] }, facts, 'sam@example.test');
  expect(c.header).toMatchObject({ fullName: 'Sam R.', headline: 'Backend Engineer', email: 'sam@example.test' });
  expect(c.sections.map((s) => s.kind)).toEqual(['summary', 'skills', 'experience', 'education', 'certificates']);
  expect(c.sections[0]).toMatchObject({ title: '', text: 'Seven years of Python.' }); // summary under the header, no heading
  expect(c.sections[1].groups[0].items).toEqual(['Python', 'PostgreSQL']); // confirmed facts beat profile keywords
  expect(c.sections[2].entries[0]).toMatchObject({ title: 'Backend Engineer', subtitle: 'Acme', start: '2019', end: 'Present', bullets: ['Built the payments API'] });
  expect(c.sections.every((s) => s.id && s.entries.every((e) => e.id))).toBe(true);
  // no facts at all: still a usable skeleton
  expect(fromProfile({ coreTech: ['Go'] }, null).sections[1].groups[0].items).toEqual(['Go']);
});

it('keeps only safe links', () => {
  expect(safeUrl('janedoe.dev')).toBe('https://janedoe.dev');
  expect(safeUrl('https://linkedin.com/in/x')).toBe('https://linkedin.com/in/x');
  expect(safeUrl('mailto:a@b.co')).toBe('mailto:a@b.co');
  expect(safeUrl('javascript:alert(1)')).toBe('');
  expect(safeUrl('file:///etc/passwd')).toBe('');
  const c = normalizeContent({ header: { links: [{ label: 'x', url: 'javascript:alert(1)' }, { label: '', url: '' }] } });
  expect(c.header.links).toEqual([{ label: 'x', url: '' }]);
});

it('keeps existing ids and fills missing ones', () => {
  const c = normalizeContent({ sections: [{ id: 'keep', kind: 'custom', entries: [{ title: 'A' }] }] });
  expect(c.sections[0].id).toBe('keep');
  expect(c.sections[0].entries[0].id).toMatch(/^[0-9a-f]{8}$/);
});

it('maps a draft back to confirmed facts and plain text, skipping hidden sections', () => {
  const c = fromProfile({ fullName: 'Sam' }, facts);
  c.sections.push({ ...c.sections[4], id: 'h', hidden: true, entries: [{ ...c.sections[4].entries[0], title: 'Hidden cert' }] });
  const s = toStructured(c);
  expect(s.roles[0]).toMatchObject({ company: 'Acme', title: 'Backend Engineer', highlights: ['Built the payments API'] });
  expect(s.skills).toEqual(['Python', 'PostgreSQL']);
  expect(s.certifications).toEqual(['AWS SAA']);
  const text = toPlainText(c);
  expect(text).toContain('WORK EXPERIENCE');
  expect(text).toContain('Backend Engineer, Acme | 2019 – Present');
  expect(text).toContain('• Built the payments API');
  expect(text).toContain('Skills: Python, PostgreSQL');
  expect(text).not.toContain('Hidden cert');
});

it('applies AI tailoring without letting it invent facts', () => {
  const c = normalizeContent({
    sections: [
      { id: 'sum', kind: 'summary', text: '7 years of Python.' },
      { id: 'sk', kind: 'skills', title: 'Skills', groups: [{ id: 'g', label: 'Backend', items: ['Python', 'Kafka', 'Go'] }] },
      { id: 'ex', kind: 'experience', title: 'Experience', entries: [
        { id: 'a', title: 'Engineer', bullets: ['Built payments for 2M users', 'Cut costs by 30%'] },
        { id: 'b', title: 'Intern', bullets: ['Wrote tests'] },
      ] },
    ],
  });
  const { content, rejected } = applyTailoring(c, {
    summary: '7 years building Python and Kafka backends.',
    entries: [{ id: 'a', bullets: ['Cut infrastructure costs by 30%', 'Built Kafka-based payments for 2M users'] }, { id: 'b', bullets: ['Wrote 500 tests'] }],
    skillGroups: [{ id: 'g', items: ['kafka', 'Rust', 'Python'] }],
    sectionOrder: ['sum', 'ex', 'sk'], notes: '',
  });
  expect(content.sections.map((s) => s.id)).toEqual(['sum', 'ex', 'sk']);
  expect(content.sections[0].text).toBe('7 years building Python and Kafka backends.');
  expect(content.sections[1].entries[0].bullets).toEqual(['Cut infrastructure costs by 30%', 'Built Kafka-based payments for 2M users']);
  expect(content.sections[1].entries[1].bullets).toEqual(['Wrote tests']); // "500" is not in the resume → rejected
  expect(rejected).toEqual(['Intern (added a number that is not in your resume)']);
  expect(content.sections[2].groups[0].items).toEqual(['Kafka', 'Python', 'Go']); // reordered, Rust dropped, Go kept
  // an order that drops or invents sections is ignored
  expect(applyTailoring(c, { entries: [], skillGroups: [], sectionOrder: ['sum', 'zzz', 'sk'], notes: '' }).content.sections.map((s) => s.id)).toEqual(['sum', 'sk', 'ex']);
});

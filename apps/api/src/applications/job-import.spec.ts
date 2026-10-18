import { htmlToText, parseJobPage } from './job-import';

describe('job import', () => {
  it('reads schema.org JobPosting JSON-LD', () => {
    const ld = { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, {
      '@type': 'JobPosting', title: 'Senior Backend Engineer',
      description: '&lt;p&gt;Build APIs.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Node&lt;/li&gt;&lt;li&gt;Postgres&lt;/li&gt;&lt;/ul&gt;',
      hiringOrganization: { '@type': 'Organization', name: 'Acme FZ-LLC', sameAs: 'https://acme.example' },
      jobLocation: [{ '@type': 'Place', address: { addressLocality: 'Dubai', addressRegion: 'Dubai', addressCountry: { name: 'AE' } } }],
      jobBenefits: ['Visa', 'Health'],
    }] };
    const html = `<html><script type="application/ld+json">{bad json</script><script type="application/ld+json">${JSON.stringify(ld)}</script></html>`;
    expect(parseJobPage(html, 'https://www.linkedin.com/jobs/view/1')).toEqual({
      jobUrl: 'https://www.linkedin.com/jobs/view/1', source: 'LinkedIn', jobTitle: 'Senior Backend Engineer', companyName: 'Acme FZ-LLC',
      companyWebsite: 'https://acme.example', location: 'Dubai, AE', jobDescription: 'Build APIs.\n\n- Node\n- Postgres', benefits: 'Visa\nHealth', seniority: 'Senior',
    });
  });

  it('falls back to meta tags', () => {
    const html = '<title>ignored</title><meta property="og:title" content="Lead Data Engineer &amp; ML"><meta name="description" content="Join us">';
    expect(parseJobPage(html, 'https://jobs.example.com/x')).toEqual({
      jobUrl: 'https://jobs.example.com/x', source: 'jobs.example.com', jobTitle: 'Lead Data Engineer & ML', jobDescription: 'Join us', seniority: 'Lead',
    });
  });

  it('flattens HTML', () => {
    expect(htmlToText('<p>A&nbsp;&#38; B</p><p>C<br>D</p>')).toBe('A & B\n\nC\nD');
  });
});

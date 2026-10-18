import { checkBaseUrl, classifyIp } from './url-guard';

describe('url guard', () => {
  it('classifies addresses', () => {
    expect(classifyIp('8.8.8.8')).toBe('public');
    expect(classifyIp('127.0.0.1')).toBe('private');
    expect(classifyIp('10.1.2.3')).toBe('private');
    expect(classifyIp('172.20.0.1')).toBe('private');
    expect(classifyIp('172.32.0.1')).toBe('public');
    expect(classifyIp('169.254.169.254')).toBe('metadata');
    expect(classifyIp('::ffff:169.254.169.254')).toBe('metadata');
    expect(classifyIp('::1')).toBe('private');
    expect(classifyIp('fd12:3456::1')).toBe('private');
  });

  it('rejects unsafe URLs', async () => {
    await expect(checkBaseUrl('ftp://x', true)).rejects.toThrow(/http/);
    await expect(checkBaseUrl('http://user:pw@localhost/v1', true)).rejects.toThrow(/credentials/);
    await expect(checkBaseUrl('http://169.254.169.254/latest', true)).rejects.toThrow(/metadata/);
    await expect(checkBaseUrl('http://127.0.0.1:11434/v1', false)).rejects.toThrow(/Private/);
    await expect(checkBaseUrl('not a url', true)).rejects.toThrow(/valid URL/);
  });

  it('accepts local endpoints when allowed', async () => {
    await expect(checkBaseUrl('http://127.0.0.1:11434/v1', true)).resolves.toMatchObject({ isLocal: true });
  });
});

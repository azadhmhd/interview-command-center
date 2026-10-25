import { join, resolve } from 'node:path';
import { config } from '../config';
import { uploadPath } from './uploads';

it('resolves stored upload paths inside the upload folder only', () => {
  const root = resolve(config.uploadDir);
  expect(uploadPath('ws1/cv.pdf')).toBe(join(root, 'ws1', 'cv.pdf'));
  // saved by local dev, read by Docker (or the other way round): same workspace/file under this machine's folder
  expect(uploadPath('/Users/someone/project/apps/api/data/uploads/ws1/cv.pdf')).toBe(join(root, 'ws1', 'cv.pdf'));
  expect(uploadPath('/data/uploads/ws1/cv.pdf')).toBe(join(root, 'ws1', 'cv.pdf'));
  expect(uploadPath('../../etc/passwd')).toBeNull();
  expect(uploadPath('/etc/passwd')).toBe(join(root, 'etc', 'passwd')); // tail only, still confined
});

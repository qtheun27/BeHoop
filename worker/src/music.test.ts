import { describe, it, expect } from 'vitest';
import { licenseOf } from './music';
describe('licences de musique', () => {
  it('garde BY, BY-SA et CC0', () => {
    expect(licenseOf('http://creativecommons.org/licenses/by/3.0/')).toBe('CC BY 3.0');
    expect(licenseOf('https://creativecommons.org/licenses/by-sa/4.0/')).toBe('CC BY-SA 4.0');
    expect(licenseOf('https://creativecommons.org/publicdomain/zero/1.0/')).toBe('CC0');
  });
  it('refuse NC et ND', () => {
    for (const k of ['by-nc', 'by-nd', 'by-nc-sa', 'by-nc-nd']) expect(licenseOf(`http://creativecommons.org/licenses/${k}/3.0/`)).toBeNull();
    expect(licenseOf('')).toBeNull();
  });
});

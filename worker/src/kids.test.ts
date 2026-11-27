import { describe, it, expect } from 'vitest';
import { kidCode } from './kids';
describe('code enfant', () => {
  it('accepte espaces, tirets et minuscules', () => { expect(kidCode('abc 234')).toBe('ABC234'); expect(kidCode('ABC-234')).toBe('ABC234'); });
  it('refuse les codes mal formés ou ambigus', () => { expect(kidCode('ABC23')).toBeNull(); expect(kidCode('ABC2340')).toBeNull(); expect(kidCode('ABCO10')).toBeNull(); });
});

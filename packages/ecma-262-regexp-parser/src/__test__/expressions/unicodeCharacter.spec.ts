import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../../index.js';

describe('Octal char', () => {
  it('should correctly unicode value', () => {
    expect(parseRegexp(/\u0061/)).toMatchSnapshot();
  });

  it('should fallback to char sequence, if octal value is out of range', () => {
    // Largest unicode value - ffff₁₆ (65535₁₀)
    expect(parseRegexp(/\ufffg/)).toMatchSnapshot();
  });

  it('should fallback to char sequence, if there is not enough chars', () => {
    expect(parseRegexp(/\u006\a/)).toMatchSnapshot('with char at the end');
    expect(parseRegexp(/\u006/)).toMatchSnapshot('with regexp end at the end');
  });
});

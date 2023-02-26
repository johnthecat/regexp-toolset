import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../../index.js';

describe('Octal char', () => {
  it('should correctly unicode value', () => {
    expect(parseRegexp(/\x61/)).toMatchSnapshot();
  });

  it('should fallback to char sequence, if octal value is out of range', () => {
    // Largest hex value - ff₁₆ (255₁₀) or U+00ff (equals to \u00ff regexp)
    expect(parseRegexp(/\xff/)).toMatchSnapshot('largest value');
    expect(parseRegexp(/\xfg/)).toMatchSnapshot('out of range');
  });

  it('should fallback to char sequence, if there is not enough chars', () => {
    expect(parseRegexp(/\xf\a/)).toMatchSnapshot('with char at the end');
    expect(parseRegexp(/\xf/)).toMatchSnapshot('with regexp end at the end');
  });
});

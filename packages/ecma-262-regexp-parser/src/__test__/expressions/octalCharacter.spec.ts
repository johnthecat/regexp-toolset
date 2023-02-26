import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../../index.js';

describe('Octal char', () => {
  it('should correctly octal value', () => {
    expect(parseRegexp(/\141/)).toMatchSnapshot();
  });

  it('should fallback to char sequence, if octal value is out of range', () => {
    // Largest octal value - 377₈ (255₁₀)
    expect(parseRegexp(/\378/)).toMatchSnapshot();
  });

  it('should fallback to char sequence, if there is not enough digits', () => {
    expect(parseRegexp(/\37d/)).toMatchSnapshot('with char at the end');
    expect(parseRegexp(/\37/)).toMatchSnapshot('with regexp end at the end');
  });
});

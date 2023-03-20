import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../../index.js';

/**
 * @see parseGroup
 * @see parseSubpatternMatch
 */
describe('Subpattern Match', () => {
  it('should refer to group with same name', () => {
    expect(parseRegexp(/(?<my_name>a) \k<my_name>/)).toMatchSnapshot();
  });

  it('should fallback to escaped char', () => {
    expect(parseRegexp(/\k/)).toMatchSnapshot('no end');
    expect(parseRegexp(/\k</)).toMatchSnapshot('with opened chevron');
    expect(parseRegexp(/\k<>/)).toMatchSnapshot('with opened and closed chevrons');
    expect(parseRegexp(/\k<hello/)).toMatchSnapshot('with opened chevron and word');
  });

  it('should throw if there is no group with such name', () => {
    expect(() => parseRegexp('/\\k<my_name>/')).toThrowErrorMatchingInlineSnapshot(`
      "
       ❱ /\\\\k<my_name>/
          ═══════════
       This token references a non-existent or invalid subpattern"
    `);
  });
});

import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../index.js';

describe('Subpattern Match', () => {
  it('should refer to group with same name', () => {
    expect(parseRegexp(/(?<my_name>a) \k<my_name>/)).toMatchSnapshot();
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

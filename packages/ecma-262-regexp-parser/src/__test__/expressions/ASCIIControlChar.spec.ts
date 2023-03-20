import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../../index.js';

/**
 * @see parseASCIIControlChar
 */
describe('ASCII Control Character', () => {
  it('should correctly parse control character', () => {
    expect(parseRegexp(/\cA/)).toMatchSnapshot('A');
    expect(parseRegexp(/\ca/)).toMatchSnapshot('a');
    expect(parseRegexp(/\cZ/)).toMatchSnapshot('Z');
    expect(parseRegexp(/\cz/)).toMatchSnapshot('z');
  });

  it('should correctly parse as escaped character at the end of the line', () => {
    expect(parseRegexp(/a\c/)).toMatchSnapshot();
  });

  it('should throw, if there is invalid character', () => {
    expect(() => parseRegexp(/\c1/)).toThrowErrorMatchingInlineSnapshot(`
      "
       ❱ /\\\\c1/
          ═══
       Invalid control character"
    `);
  });
});

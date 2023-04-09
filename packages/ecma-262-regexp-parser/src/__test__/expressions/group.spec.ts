import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../../index.js';

/**
 * @see parseGroup
 */
describe('Group', () => {
  describe('Common', () => {
    it('should throw, if group is not closed', () => {
      expect(() => parseRegexp('/(ab/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❯ /(ab/
            ════
         Incomplete group structure"
      `);
    });

    it('should throw, there is unmatched parenthesis', () => {
      expect(() => parseRegexp('/(ab))/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❯ /(ab))/
                ↑
         Unmatched parenthesis"
      `);
    });

    it('should correctly parse nested groups', () => {
      expect(parseRegexp('/(a(f)b)/')).toMatchSnapshot();
    });
  });

  describe.each([
    { name: 'Capturing Group', prefix: '' },
    { name: 'Named Capturing Group', prefix: '?<my_name>' },
    { name: 'Non Capturing Group', prefix: '?:' },
    { name: 'Positive lookahead', prefix: '?=' },
    { name: 'Positive lookbehind', prefix: '?<=' },
    { name: 'Negative lookahead', prefix: '?!' },
    { name: 'Negative lookbehind', prefix: '?<!' },
  ])('$name', ({ prefix }) => {
    it('should parse simple', () => {
      expect(parseRegexp(new RegExp(`(${prefix}a)`))).toMatchSnapshot();
    });
  });
});

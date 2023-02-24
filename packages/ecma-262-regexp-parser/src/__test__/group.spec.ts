import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../index.js';

describe('Group', () => {
  describe('Common', () => {
    it('should throw, if group is not closed', () => {
      expect(() => parseRegexp('/(ab/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❱ /(ab/
            ════
         Incomplete group structure"
      `);
    });

    it('should throw, there is unmatched parenthesis', () => {
      expect(() => parseRegexp('/(ab))/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❱ /(ab))/
                ═
         Unmatched parenthesis"
      `);
    });

    it('should correctly parse nested groups', () => {
      expect(parseRegexp('/(a(f)b)/')).toMatchSnapshot();
    });
  });

  describe('Capturing group', () => {
    it('should parse simple capturing group', () => {
      expect(parseRegexp('/(ab)/')).toMatchSnapshot();
    });
  });

  describe('Non Capturing group', () => {
    it('should parse simple non capturing group', () => {
      expect(parseRegexp('/(?:ab)/')).toMatchSnapshot();
    });
  });

  describe('Positive lookahead', () => {
    it('should parse simple positive lookahead', () => {
      expect(parseRegexp('/(?=ab)/')).toMatchSnapshot();
    });
  });

  describe('Negative lookahead', () => {
    it('should parse simple negative lookahead', () => {
      expect(parseRegexp('/(?!ab)/')).toMatchSnapshot();
    });
  });

  describe('Positive lookbehind', () => {
    it('should parse simple positive lookbehind', () => {
      expect(parseRegexp('/(?<=ab)/')).toMatchSnapshot();
    });
  });

  describe('Negative lookbehind', () => {
    it('should parse simple negative lookbehind', () => {
      expect(parseRegexp('/(?<!ab)/')).toMatchSnapshot();
    });
  });
});

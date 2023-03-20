import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../../index.js';

/**
 * @see parseRangeQuantifier
 */
describe('Range quantifier', () => {
  describe.each([
    { type: 'exact', quantifier: '{2}' },
    { type: 'from', quantifier: '{2,}' },
    { type: 'from to', quantifier: '{2,3}' },
  ])('$type (a$quantifier)', ({ quantifier }) => {
    it('should parse repetition count', () => {
      expect(parseRegexp(new RegExp(`a${quantifier}`))).toMatchSnapshot();
    });

    it('should correct work with lazy quantifier', () => {
      expect(parseRegexp(new RegExp(`a${quantifier}?`))).toMatchSnapshot();
    });
  });

  describe('Special cases', () => {
    it('should throw if range start is bigger than end', () => {
      expect(() => parseRegexp('/a{4,2}/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❱ /a{4,2}/
             ═════
         The quantifier range is out of order"
      `);
    });
  });

  describe('common errors', () => {
    it('should detect to quantifiable tokens', () => {
      expect(() => parseRegexp('/${1}/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❱ /\${1}/
            ↑
         The preceding token is not quantifiable"
      `);
    });

    it('should throw if there is no expression before', () => {
      expect(() => parseRegexp('/{1}/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❱ /{1}/
            ↑
         There is nothing to quantify"
      `);
    });
  });
});

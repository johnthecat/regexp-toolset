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
  ])('$type $quantifier', ({ quantifier }) => {
    it('should parse repetition count', () => {
      expect(parseRegexp(new RegExp(`a${quantifier}`))).toMatchSnapshot();
    });

    it('should correct work with lazy quantifier', () => {
      expect(parseRegexp(new RegExp(`a${quantifier}?`))).toMatchSnapshot();
    });

    it('should detect non-quantifiable tokens', () => {
      expect(() => parseRegexp(`/^${quantifier}/`)).toThrowErrorMatchingInlineSnapshot(`
        "
         ❯ /\^${quantifier}/
            ↑
         The preceding token is not quantifiable"
      `);
    });

    it('should throw if there is no expression before', () => {
      expect(() => parseRegexp(`/${quantifier}/`)).toThrowErrorMatchingInlineSnapshot(`
        "
         ❯ /${quantifier}/
            ↑
         There is nothing to quantify"
      `);
    });
  });

  describe('Special cases', () => {
    it('should pass range with equal start and end values', () => {
      expect(() => parseRegexp('/a{2,2}/')).not.toThrow();
    });

    it('should throw if range start is bigger than end', () => {
      expect(() => parseRegexp('/a{4,2}/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❯ /a{4,2}/
             ═════
         The quantifier range is out of order"
      `);
    });
  });
});

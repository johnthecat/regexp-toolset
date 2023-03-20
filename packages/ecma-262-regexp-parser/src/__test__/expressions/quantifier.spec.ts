import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../../index.js';

/**
 * @see parseQuantifier
 */
describe('Quantifier', () => {
  describe.each([
    { title: 'none or single', quantifier: '?' },
    { title: 'none or many', quantifier: '*' },
    { title: 'single or many', quantifier: '*' },
  ])('$title ($quantifier)', ({ quantifier }) => {
    it('should be parsed', () => {
      expect(parseRegexp(new RegExp(`a${quantifier}`))).toMatchSnapshot();
    });

    it('should correct work with lazy quantifier', () => {
      expect(parseRegexp(new RegExp(`a${quantifier}?`))).toMatchSnapshot();
    });

    it('should detect to quantifiable tokens', () => {
      expect(() => parseRegexp(`/$${quantifier}/`)).toThrowErrorMatchingSnapshot();
    });

    it('should throw if there is no expression before', () => {
      expect(() => parseRegexp(`/${quantifier}/`)).toThrowErrorMatchingSnapshot();
    });
  });
});

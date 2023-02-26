import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../../index.js';

describe('Repetition', () => {
  describe('Range', () => {
    it('should correct work with lazy quantifier', () => {
      expect(parseRegexp(/a{2}?/)).toMatchSnapshot();
    });

    describe('Exact', () => {
      it('should parse repetition count', () => {
        expect(parseRegexp(/a{2}/)).toMatchSnapshot();
      });
      it('should parse unclosed range as chars', () => {
        expect(parseRegexp(/a{2/)).toMatchSnapshot();
      });
      it('should parse unclosed range as chars', () => {
        expect(parseRegexp(/a2}/)).toMatchSnapshot();
      });
    });

    describe('From exact to unlimited', () => {
      it('should parse repetition count', () => {
        expect(parseRegexp(/a{2,}/)).toMatchSnapshot();
      });
      it('should parse unclosed range as chars', () => {
        expect(parseRegexp(/a{2,/)).toMatchSnapshot();
      });
      it('should parse unclosed range as chars', () => {
        expect(parseRegexp(/a2,}/)).toMatchSnapshot();
      });
    });

    describe('From exact to exact', () => {
      it('should parse repetition count', () => {
        expect(parseRegexp(/a{2,4}/)).toMatchSnapshot();
      });
      it('should parse unclosed range as chars', () => {
        expect(parseRegexp(/a{2,4/)).toMatchSnapshot();
      });
      it('should parse unclosed range as chars', () => {
        expect(parseRegexp(/a2,4}/)).toMatchSnapshot();
      });

      it('should throw if range start is bigger than end', () => {
        expect(() => parseRegexp('/a{4,2}/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❱ /a{4,2}/
             ═════
         The quantifier range is out of order"
      `);
      });
    });

    describe('Errors', () => {
      it('should detect to quantifiable tokens', () => {
        expect(() => parseRegexp('/${1}/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❱ /\${1}/
             ═
         The preceding token is not quantifiable"
      `);
      });

      it('should throw if there is no expression before', () => {
        expect(() => parseRegexp('/{1}/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❱ /{1}/
            ═
         There is nothing to quantify"
      `);
      });
    });
  });

  describe('None or single (?)', () => {
    it('should be parsed', () => {
      expect(parseRegexp(/a?/)).toMatchSnapshot();
    });

    it('should correct work with lazy quantifier', () => {
      expect(parseRegexp(/a??/)).toMatchSnapshot();
    });

    it('should detect to quantifiable tokens', () => {
      expect(() => parseRegexp('/$?/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❱ /\$?/
             ═
         The preceding token is not quantifiable"
      `);
    });

    it('should throw if there is no expression before', () => {
      expect(() => parseRegexp('/?/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❱ /?/
            ═
         There is nothing to quantify"
      `);
    });
  });

  describe('None or many (*)', () => {
    it('should be parsed', () => {
      expect(parseRegexp(/a*/)).toMatchSnapshot();
    });

    it('should correct work with lazy quantifier', () => {
      expect(parseRegexp(/a*?/)).toMatchSnapshot();
    });

    it('should detect to quantifiable tokens', () => {
      expect(() => parseRegexp('/$*/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❱ /\$*/
             ═
         The preceding token is not quantifiable"
      `);
    });

    it('should throw if there is no expression before', () => {
      expect(() => parseRegexp('/*/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❱ /*/
            ═
         There is nothing to quantify"
      `);
    });
  });
});

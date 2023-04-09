import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../../index.js';

/**
 * @see parseRegexp
 */
describe('Regexp', () => {
  describe('body', () => {
    it('should throw if there is empty input', () => {
      expect(() => parseRegexp('')).toThrowErrorMatchingInlineSnapshot(`
        "
        ❯ Can't parse input"
      `);
    });

    it('should throw if there is no starting slash', () => {
      expect(() => parseRegexp('a/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❯ a/
           ↑
         Regexp body should start with \\"/\\" symbol, like this: /.../gm"
      `);
    });

    it('should throw if there is no ending slash', () => {
      expect(() => parseRegexp('/a')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❯ /a
            ↑
         Regexp body should end with \\"/\\" symbol, like this: /.../gm"
      `);
    });

    it('should throw if there is more than 1 ending slashes', () => {
      expect(() => parseRegexp('/a/[a-z]/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❯ /a/[a-z]/
              ↑
           Unexpected token"
      `);
    });
  });

  describe('flags', () => {
    it('should correctly parse flags', () => {
      expect(parseRegexp(/a/gimsuy)).toMatchSnapshot();
    });

    it('should throw if there is unsupported flag', () => {
      expect(() => parseRegexp('/a/f')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❯ /a/f
              ↑
         Unknown flag 'f'"
      `);
    });

    it('should throw if there is any characters other than alphabetical', () => {
      expect(() => parseRegexp('/a/[')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❯ /a/[
              ↑
         Unexpected token"
      `);
    });
  });
});

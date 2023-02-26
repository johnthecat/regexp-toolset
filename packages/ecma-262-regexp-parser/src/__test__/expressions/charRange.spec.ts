import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../../index.js';

describe('CharRange', () => {
  it('should correctly parse simple char range', () => {
    expect(parseRegexp(/[a-z]/)).toMatchSnapshot();
  });

  it('should correctly parse range as chars outside char class', () => {
    expect(parseRegexp(/a-z/)).toMatchSnapshot();
  });

  it('should correctly parse range with unicode', () => {
    expect(parseRegexp(/[\u0061-\u007a]/)).toMatchSnapshot();
  });

  it('should correctly parse range with hex', () => {
    expect(parseRegexp(/[\x61-\x7a]/)).toMatchSnapshot();
  });

  it('should correctly parse range with octal', () => {
    expect(parseRegexp(/[\141-\172]/)).toMatchSnapshot();
  });

  it('should correctly parse range with empty start as chars', () => {
    expect(parseRegexp(/[-z]/)).toMatchSnapshot();
  });

  it('should correctly parse range with empty end as chars', () => {
    expect(parseRegexp(/[a-]/)).toMatchSnapshot();
  });

  describe('Errors', () => {
    it('should throw, if range is out of order', () => {
      expect(() => parseRegexp('/[z-a]/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❱ /[z-a]/
             ═══
         Character range is out of order: from 'z' (index 122) to 'a' (index 97)"
      `);
    });
  });
});

import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../../index.js';

describe('CharClass', () => {
  it('should correctly parse simple char class', () => {
    expect(parseRegexp(/[a]/)).toMatchSnapshot();
  });

  it('should correctly parse if there are two open brackets', () => {
    expect(parseRegexp(/[[ab]/)).toMatchSnapshot();
  });

  it('should correctly parse syntax chars', () => {
    expect(parseRegexp(/[\\.*+?)(\]\[}{|$^]/)).toMatchSnapshot();
  });

  it('can be empty', () => {
    expect(parseRegexp('/[]/')).toMatchSnapshot();
  });

  it('should correctly parse char range', () => {
    expect(parseRegexp('/[a-z]/')).toMatchSnapshot();
  });

  it('should be quantifiable', () => {
    expect(parseRegexp('/[a]*/')).toMatchSnapshot();
    expect(parseRegexp('/[a]{1}/')).toMatchSnapshot();
  });

  describe('Errors', () => {
    it('should throw, if char class is not closed', () => {
      expect(() => parseRegexp('/[ab/')).toThrowErrorMatchingInlineSnapshot(`
        "
         ❱ /[ab/
            ════
         Character class missing closing bracket"
      `);
    });
  });
});

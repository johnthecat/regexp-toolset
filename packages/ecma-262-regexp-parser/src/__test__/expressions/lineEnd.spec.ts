import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../../index.js';

describe('Line End', () => {
  it('should correctly parse line end in the end of regexp', () => {
    expect(parseRegexp(/a$/)).toMatchSnapshot();
  });
  it('should correctly parse line end in the middle of regexp', () => {
    expect(parseRegexp(/a$a/)).toMatchSnapshot();
  });
  it('should correctly parse line end in the start of regexp', () => {
    expect(parseRegexp(/$a/)).toMatchSnapshot();
  });
});

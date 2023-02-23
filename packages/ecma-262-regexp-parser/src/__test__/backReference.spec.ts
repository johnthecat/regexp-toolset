import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../index.js';

describe('Back Reference', () => {
  it('should parse back reference', () => {
    expect(parseRegexp(/(a)\1/)).toMatchSnapshot();
  });
});

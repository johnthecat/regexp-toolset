import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../../index.js';

describe('Line Start', () => {
  it('should correctly parse line start in the start of regexp', () => {
    expect(parseRegexp(/^a/)).toMatchSnapshot();
  });
  it('should correctly parse line start in the middle of regexp', () => {
    expect(parseRegexp(/a^a/)).toMatchSnapshot();
  });
  it('should correctly parse line start in the end of regexp', () => {
    expect(parseRegexp(/a^/)).toMatchSnapshot();
  });
});

import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../../index.js';

describe('Disjunction', () => {
  it('should parse simple disjunction', () => {
    expect(parseRegexp(/a|b/)).toMatchSnapshot();
  });

  it('should parse chained disjunction', () => {
    expect(parseRegexp(/a|b|c/)).toMatchSnapshot();
  });

  it('should parse disjunction with empty right size', () => {
    expect(parseRegexp(/a|/)).toMatchSnapshot();
  });

  // TODO fix position of zero length node
  it('should parse disjunction with empty left size', () => {
    expect(parseRegexp(/|b/)).toMatchSnapshot();
  });

  it('should parse disjunction inside group', () => {
    expect(parseRegexp(/(a|b)/)).toMatchSnapshot();
  });
});

import { describe, it, expect } from 'vitest';
import { matched, unmatched, matchSeq } from '../common/match.js';

describe('Monad', () => {
  it('should chain matched', () => {
    const x = matched(1);
    const y = x.matched(a => matched(a + 1));
    expect(y.unwrap()).toEqual({ match: true, value: 2 });
  });
  it('should chain unmatched', () => {
    const x = unmatched(1);
    const y = x.unmatched(a => unmatched(a + 1));
    expect(y.unwrap()).toEqual({ match: false, value: 2 });
  });

  it('should skip matched after unmatched', () => {
    const x = unmatched(1);
    const y = x.matched(() => matched(2));
    expect(y.unwrap()).toEqual({ match: false, value: 1 });
  });

  it('should skip unmatched after matched', () => {
    const x = matched(1);
    const y = x.unmatched(() => unmatched(2));
    expect(y.unwrap()).toEqual({ match: true, value: 1 });
  });

  it('should restore to matched', () => {
    const x = unmatched(1);
    const y = x.unmatched(a => matched(a + 1));
    expect(y.unwrap()).toEqual({ match: true, value: 2 });
  });

  it('should restore to matched', () => {
    const x = unmatched(1);
    const y = x.unmatched(a => matched(a + 1));
    expect(y.unwrap()).toEqual({ match: true, value: 2 });
  });

  it('should seq matchers', () => {
    const list = matchSeq([matched(1), matched(2), matched(3)]);
    expect(list.unwrap()).toEqual({ match: true, value: [1, 2, 3] });
  });

  it('should fail seq if one of matchers unmatched', () => {
    const list = matchSeq([matched(1), matched(2), unmatched(3)]);
    expect(list.unwrap()).toEqual({ match: false, value: 3 });
  });
});

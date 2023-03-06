import { describe, it, expect } from 'vitest';
import { matched, unmatched, all } from '../common/monads/match.js';

describe('Monad', () => {
  it('should chain matched', () => {
    const x = matched(1);
    const y = x.matched(a => matched(a + 1));
    expect(y.unwrap()).toEqual({ match: true, value: 2 });
  });

  it('should skip matched after unmatched', () => {
    const x = unmatched();
    const y = x.matched(() => matched(2));
    expect(y.unwrap()).toEqual({ match: false });
  });

  it('should skip unmatched after matched', () => {
    const x = matched(1);
    const y = x.unmatched(() => unmatched());
    expect(y.unwrap()).toEqual({ match: true, value: 1 });
  });

  it('should restore to matched', () => {
    const x = unmatched();
    const y = x.unmatched(() => matched(2));
    expect(y.unwrap()).toEqual({ match: true, value: 2 });
  });

  it('should restore to matched', () => {
    const x = unmatched();
    const y = x.unmatched(() => matched(2));
    expect(y.unwrap()).toEqual({ match: true, value: 2 });
  });

  it('should pass all matched matchers', () => {
    const list = all(matched(1), matched(2), matched(3));
    expect(list.unwrap()).toEqual({ match: true, value: [1, 2, 3] });
  });

  it('should fail all if one of matchers unmatched', () => {
    const list = all(matched(1), matched(2), unmatched());
    expect(list.unwrap()).toEqual({ match: false });
  });
});

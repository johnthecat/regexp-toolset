import { describe, it, expect } from 'vitest';
import { ok, none, all } from '../common/fp/match.js';

describe('Monad', () => {
  it('should chain matched', () => {
    const x = ok(1);
    const y = x.match(a => ok(a + 1));
    expect(y.unwrap()).toEqual({ match: true, value: 2 });
  });

  it('should skip matched after unmatched', () => {
    const x = none();
    const y = x.match(() => ok(2));
    expect(y.unwrap()).toEqual({ match: false });
  });

  it('should skip unmatched after matched', () => {
    const x = ok(1);
    const y = x.unmatch(() => none());
    expect(y.unwrap()).toEqual({ match: true, value: 1 });
  });

  it('should restore to matched', () => {
    const x = none();
    const y = x.unmatch(() => ok(2));
    expect(y.unwrap()).toEqual({ match: true, value: 2 });
  });

  it('should restore to matched', () => {
    const x = none();
    const y = x.unmatch(() => ok(2));
    expect(y.unwrap()).toEqual({ match: true, value: 2 });
  });

  it('should pass all matched matchers', () => {
    const list = all([ok(1), ok(2), ok(3)]);
    expect(list.unwrap()).toEqual({ match: true, value: [1, 2, 3] });
  });

  it('should fail all if one of matchers unmatched', () => {
    const list = all([ok(1), ok(2), none()]);
    expect(list.unwrap()).toEqual({ match: false });
  });
});

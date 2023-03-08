import type { Match, Matched, Unmatched, UnmatchedError } from './types.js';

type InferMatchedValue<T> = T extends Match<infer U> ? U : never;
type Result<M> = Matched<M> | Unmatched | UnmatchedError;

const isMatched = <M>(x: Result<M>): x is Matched<M> => x.match;
const isError = <M>(x: Result<M>): x is UnmatchedError => !isMatched(x) && 'error' in x;
const isUnmatched = <M>(x: Result<M>): x is Unmatched => !isMatched(x) && !('error' in x);

const matchImplementation = <M>(x: Result<M>): Match<M> => {
  const self: Match<M> = {
    matched: fn => self.flatMap(fn),
    unmatched: fn => (isUnmatched(x) ? fn() : (self as Match<never>)),
    error: fn => (isError(x) ? fn(x.error) : (self as Match<never>)),
    map: fn => (isMatched(x) ? ok(fn(x.value)) : (self as Match<never>)),
    flatMap: fn => (isMatched(x) ? fn(x.value) : (self as any)),
    filter: (fn: (x: M) => boolean) =>
      isMatched(x) ? (fn(x.value) ? (self as Match<never>) : none()) : (self as Match<never>),
    isMatched: () => ok(x.match),
    orElse: fn => (isUnmatched(x) ? fn() : self),
    orError: fn => (isUnmatched(x) ? err(fn()) : self),
    unwrap: () => x,
  };

  return self;
};

export const ok = <M>(value: M): Match<M> => {
  return matchImplementation({
    match: true,
    value,
  });
};

export const none = (): Match<never> => {
  return matchImplementation({ match: false });
};

export const err = (error: Error): Match<never> => {
  return matchImplementation({ match: false, error });
};

export const all = <T extends Match<unknown>[]>(
  ...matches: [...T]
): Match<{ [K in keyof T]: InferMatchedValue<T[K]> }> => {
  const result: unknown[] = [];
  for (const matcher of matches) {
    const v = matcher.unwrap();
    if (!v.match) {
      return matcher as never;
    }
    result.push(v.value);
  }

  return ok(result) as Match<{ [K in keyof T]: InferMatchedValue<T[K]> }>;
};

export const first = <R1>(...matchers: (() => Match<R1>)[]): Match<R1> => {
  let lastResult: Match<R1> = none();
  for (const matcher of matchers) {
    lastResult = lastResult.unmatched(matcher);
  }
  return lastResult.orError(() => new Error(`Can't match any.`));
};

export const nonNullable = <T>(value: T): Match<NonNullable<T>> =>
  value === null || value === void 0 ? none() : ok(value);

export { Match };

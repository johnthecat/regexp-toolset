export type Matched<T> = {
  match: true;
  value: T;
};

export type Unmatched = {
  match: false;
};

export type UnmatchedError = {
  match: false;
  error: Error;
};

export interface Match<M> {
  map<R1>(fn: (value: M) => R1): Match<R1>;

  orElse<R>(fn: () => Match<R>): Match<M | R>;

  orError(fn: () => Error): Match<M>;

  match<R1>(fn: (value: M) => Match<R1>): Match<R1>;

  unmatch<R1>(fn: () => Match<R1>): Match<R1>;

  isMatched(): Match<boolean>;

  unwrap(): Matched<M> | Unmatched | UnmatchedError;

  filter<R extends M>(fn: (value: M) => value is R): Match<R>;

  filter(fn: (value: M) => boolean): Match<M>;

  filterOrThrow<R extends M>(fn: (value: M) => value is R, err: () => Error): Match<R>;

  filterOrThrow(fn: (value: M) => boolean, err: (value: M) => Error): Match<M>;
}

type InferMatchedValue<T> = T extends Match<infer U> ? U : never;
type Result<M> = Matched<M> | Unmatched | UnmatchedError;

const isMatched = <M>(x: Result<M>): x is Matched<M> => x.match;
const isUnmatched = <M>(x: Result<M>): x is Unmatched => !isMatched(x) && !('error' in x);

const caught = <T>(fn: () => Match<T>): Match<T> => {
  try {
    return fn();
  } catch (e) {
    return err(e as Error) as unknown as Match<T>;
  }
};

const matchImplementation = <M>(x: Result<M>): Match<M> => {
  const self: Match<M> = {
    match: fn => (isMatched(x) ? caught(() => fn(x.value)) : (self as any)),
    unmatch: fn => (isUnmatched(x) ? fn() : (self as Match<never>)),
    map: fn => (isMatched(x) ? caught(() => ok(fn(x.value))) : (self as Match<never>)),
    filter: (fn: (x: M) => boolean) =>
      isMatched(x) ? caught(() => (fn(x.value) ? (self as Match<never>) : none())) : (self as Match<never>),
    filterOrThrow: (fn: (x: M) => boolean, error: (x: M) => Error) =>
      isMatched(x)
        ? caught(() => (fn(x.value) ? (self as Match<never>) : err(error(x.value))))
        : (self as Match<never>),
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
  matches: [...T],
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
    lastResult = lastResult.unmatch(matcher);
  }
  return lastResult.orError(() => new Error(`Can't match any.`));
};

export const nonNullable = <T>(value: T): Match<NonNullable<T>> =>
  value === null || value === void 0 ? none() : ok(value);

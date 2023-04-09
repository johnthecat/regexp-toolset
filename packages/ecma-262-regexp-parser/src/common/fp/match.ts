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

export class Match<M> {
  constructor(private x: Result<M>) {}

  match<R1>(fn: (value: M) => Match<R1>): Match<R1> {
    const { x } = this;
    return isMatched(x) ? caught(() => fn(x.value)) : (this as never);
  }

  unmatch<R1>(fn: () => Match<R1>): Match<R1> {
    const { x } = this;
    return isUnmatched(x) ? fn() : (this as never);
  }

  matchOrError<R1>(fn: (value: M) => Match<R1>, error: (value: M) => Error | Match<Error>): Match<R1> {
    const { x } = this;
    return isMatched(x)
      ? caught(() => fn(x.value)).unmatch(() => {
          const result = error(x.value);
          return result instanceof Error ? err(result) : result.match(err);
        })
      : (this as never);
  }

  map<R1>(fn: (value: M) => R1): Match<R1> {
    const { x } = this;
    return isMatched(x) ? caught(() => ok(fn(x.value))) : (this as never);
  }

  filter<R extends M>(fn: (value: M) => value is R): Match<R>;
  filter(fn: (value: M) => boolean): Match<M>;
  filter(fn: (x: M) => boolean): Match<M> {
    const { x } = this;
    return isMatched(x) ? (fn(x.value) ? (this as never) : none()) : (this as never);
  }

  filterOrError<R extends M>(fn: (value: M) => value is R, err: (value: M) => Error | Match<Error>): Match<R>;
  filterOrError(fn: (value: M) => boolean, err: (value: M) => Error | Match<Error>): Match<M>;
  filterOrError(fn: (x: M) => boolean, error: (x: M) => Error | Match<Error>): Match<M> {
    const { x } = this;
    return isMatched(x)
      ? caught(() => {
          if (fn(x.value)) {
            return this as never;
          }
          const result = error(x.value);
          return result instanceof Error ? err(result) : result.match(err);
        })
      : (this as never);
  }

  isMatched(): Match<boolean> {
    return ok(this.x.match);
  }

  orElse<R>(fn: () => Match<R>): Match<M | R> {
    const { x } = this;
    return isUnmatched(x) ? fn() : this;
  }

  orError(fn: () => Error): Match<M> {
    const { x } = this;
    return isUnmatched(x) ? err(fn()) : this;
  }

  unwrap(): Matched<M> | Unmatched | UnmatchedError {
    return this.x;
  }

  unwrapOrThrow(): M {
    const { x } = this;
    if (isMatched(x)) {
      return x.value;
    }
    if ('error' in x) {
      throw x.error;
    }
    throw new Error('Unknown error!');
  }
}

const matchImplementation = <M>(x: Result<M>): Match<M> => {
  return new Match(x);
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
  return lastResult;
};

export const nonNullable = <T>(value: T): Match<NonNullable<T>> =>
  value === null || value === void 0 ? none() : ok(value);

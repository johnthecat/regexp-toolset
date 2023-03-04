export type Matched<T> = {
  match: true;
  value: T;
};

export type Unmatched<T> = {
  match: false;
  value: T;
};

export type UnmatchedError = {
  match: false;
  error: Error;
};

export type Result<M, U = M> = Matched<M> | Unmatched<U> | UnmatchedError;

export type Monad<M, U = M> = {
  matched<R1, R2>(fn: (value: M) => Monad<R1, R2>): Monad<R1, R2>;
  unmatched<R1, R2>(fn: (value: U) => Monad<R1, R2>): Monad<R1, R2>;
  map<R1>(fn: (value: M) => R1): Monad<R1, U>;
  flatMap<R1, R2>(fn: (result: Result<M, U>) => Monad<R1, R2>): Monad<R1, R2>;
  error<R1, R2>(fn: (error: Error) => Monad<R1, R2>): Monad<R1, R2>;
  unwrap(): Result<M, U>;
};

type InferMonadMatchedValue<T> = T extends Monad<infer U, unknown> ? U : never;

export const matched = <M>(value: M): Monad<M, never> => {
  const self: Monad<M, never> = {
    matched: fn => fn(value),
    unmatched: () => self as Monad<never>,
    error: () => self as Monad<never>,
    map: fn => matched(fn(value)),
    flatMap: fn => fn(self.unwrap()),
    unwrap: () => ({
      match: true,
      value,
    }),
  };

  return self;
};

export const unmatched = <U>(value: U): Monad<never, U> => {
  const self: Monad<never, U> = {
    matched: () => self as Monad<never>,
    unmatched: fn => fn(value),
    error: () => self as Monad<never>,
    map: () => self,
    flatMap: fn => fn(self.unwrap()),
    unwrap: () => ({
      match: false,
      value,
    }),
  };

  return self;
};

export const errored = (error: Error): Monad<never> => {
  const self: Monad<never> = {
    matched: () => self,
    unmatched: () => self,
    error: fn => fn(error),
    map: () => self,
    flatMap: fn => fn(self.unwrap()),
    unwrap: () => ({
      match: false,
      error,
    }),
  };

  return self;
};

export const matchSeq = <T extends Monad<unknown>[]>(
  matches: [...T],
): Monad<{ [K in keyof T]: InferMonadMatchedValue<T[K]> }> => {
  let result = matched<unknown[]>([]);

  for (const monad of matches) {
    result = monad.matched(x => result.map(list => list.concat(x)));
  }

  return result as Monad<{ [K in keyof T]: InferMonadMatchedValue<T[K]> }>;
};

export const matchFirst = <R1>(
  matchers: (() => Monad<R1, unknown>)[],
  defaultReturn?: Monad<R1, unknown>,
): Monad<R1, unknown> => {
  let lastResult: Monad<R1, unknown> = unmatched(null);
  for (const matcher of matchers) {
    lastResult = lastResult.unmatched(() => matcher());
  }
  return lastResult.unmatched(() => defaultReturn ?? errored(new Error(`Can't match any.`)));
};

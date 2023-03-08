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
  flatMap<R1>(fn: (value: M) => Match<R1>): Match<R1>;
  orElse<R>(fn: () => Match<R>): Match<M | R>;
  orError(fn: () => Error): Match<M>;

  matched<R1>(fn: (value: M) => Match<R1>): Match<R1>;
  unmatched<R1>(fn: () => Match<R1>): Match<R1>;
  error<R1>(fn: (error: Error) => Match<R1>): Match<R1>;

  isMatched(): Match<boolean>;
  unwrap(): Matched<M> | Unmatched | UnmatchedError;

  filter<R extends M>(fn: (value: M) => value is R): Match<R>;
  filter(fn: (value: M) => boolean): Match<M>;
}

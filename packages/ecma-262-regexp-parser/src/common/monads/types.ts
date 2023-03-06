// Solution based on https://stackoverflow.com/a/55694876
type TypeStore<A> = {
  Match: Match<A>;
};

type $keys = keyof TypeStore<any>;
type HigherKindedType<$ extends $keys, A> = TypeStore<A>[$];

export type Functor<$ extends $keys, T> = {
  map<U>(fn: (value: T) => U): HigherKindedType<$, U>;
};

export interface Monad<$ extends $keys, T> extends Functor<$, T> {
  flatMap<U extends HigherKindedType<$, unknown>>(fn: (value: T) => U): U;
}

// Match

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

export type Match<M> = Monad<'Match', M> & {
  matched<R1>(fn: (value: M) => Match<R1>): Match<R1>;
  unmatched<R1>(fn: () => Match<R1>): Match<R1>;
  error<R1>(fn: (error: Error) => Match<R1>): Match<R1>;
  unwrap(): Matched<M> | Unmatched | UnmatchedError;
  filter<R = M>(fn: (value: M) => boolean): Match<R>;
  orElse<R>(fn: () => Match<R>): Match<M | R>;
  isMatched(): Match<boolean>;
  orError(fn: () => Error): Match<M>;
};

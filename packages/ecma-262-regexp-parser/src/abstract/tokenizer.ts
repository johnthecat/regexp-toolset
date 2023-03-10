import { createStringStream, type InputStreamIterator } from './inputStream.js';
import { LazyDoublyLinkedList, type LintedListNode } from '../common/lazyDoublyLinkedList.js';

export type Token<K, V extends string = string> = {
  kind: K;
  value: V;
  start: number;
  end: number;
};

export type AnyToken<K = any, V extends string = string> = Token<K, V>;

export type TokenizerStep<Token extends AnyToken = AnyToken> = LintedListNode<Token>;

export type TokenMatcherResult<T extends TokenizerStep> = IteratorResult<T, T> & {
  match: boolean;
};
export type TokenMatcherFn<T extends TokenizerStep> = (step: T) => TokenMatcherResult<T>;

export type TokenReducerResult<Step extends TokenizerStep, Result> = IteratorResult<Step, Step> & {
  result: Result;
};

export type TokenReducerFn<T extends TokenizerStep, R> = (step: T, result: R) => TokenReducerResult<T, R>;

export type TokenMatchReducerResult<Step extends TokenizerStep, Result> = IteratorResult<Step, Step> & {
  result: Result;
  match: boolean;
};

export type TokenMatchReducerFn<T extends TokenizerStep, R, U extends TokenizerStep = T> = (
  step: T,
  result: R,
) => TokenMatchReducerResult<U, R>;

export type TokenizerIterator<T extends TokenizerStep> = Iterator<T, null>;

export type TokenizerIterable<T extends TokenizerStep> = {
  [Symbol.iterator](): TokenizerIterator<T>;
};

export type TokenizerApi<T extends AnyToken> = TokenizerIterable<TokenizerStep<T>> & {
  isFirstToken(token: T): boolean;
  isLastToken(token: T): boolean;
  getFirstStep(): TokenizerStep<T> | null;
  iterate(step: TokenizerStep<T>): TokenizerIterable<TokenizerStep<T>>;
};

export type Tokenizer<T extends AnyToken = AnyToken> = TokenizerApi<T>;

export type Handler<T extends AnyToken> = (inputStream: InputStreamIterator) => T | null;

type InferHandlerResult<T extends Handler<any>> = T extends Handler<infer U> ? Exclude<U, null> : never;

export const createStepIterator = <T extends TokenizerStep>(step: T | null): TokenizerIterator<T> => {
  let currentToken: TokenizerStep | null = step;
  return {
    next() {
      if (!currentToken) {
        return { done: true, value: null };
      }

      const tokenToReturn = currentToken;
      currentToken = currentToken.next();
      return { done: false, value: tokenToReturn as T };
    },
  };
};

export const createStepIterable = <T extends TokenizerStep>(step: T | null): TokenizerIterable<T> => {
  return {
    [Symbol.iterator]: () => createStepIterator(step),
  };
};

export const createTokenizer = <T extends Handler<AnyToken>>(
  input: string,
  handler: T,
): Tokenizer<InferHandlerResult<T>> => {
  const stream = createStringStream(input);
  const chars = stream.chars();
  const list = new LazyDoublyLinkedList<AnyToken>(() => (chars.isDone() ? null : handler(chars)));
  const api: Tokenizer = {
    ...createStepIterable(list.getHead()),
    isFirstToken: token => token.start === 0,
    isLastToken: token => token.end === stream.size(),
    getFirstStep: () => list.getHead(),
    iterate: createStepIterable,
  };
  return api as Tokenizer<InferHandlerResult<T>>;
};

export const createToken = <CurrentToken extends AnyToken>(
  kind: CurrentToken['kind'],
  value: CurrentToken['value'],
  start: CurrentToken['start'],
  end: CurrentToken['end'],
) =>
  ({
    kind,
    value,
    start,
    end,
  } as CurrentToken);

export const createHandler =
  <CurrentToken extends AnyToken>(kind: CurrentToken['kind'], regexp: RegExp): Handler<CurrentToken> =>
  input => {
    const result = input.collect(regexp);
    if (!result) {
      return null;
    }
    return createToken<CurrentToken>(kind, result.value as CurrentToken['value'], result.start, result.end);
  };

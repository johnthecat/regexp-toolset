import { createStringStream, type InputStreamIterator } from './inputStream.js';
import { LazyLinkedList, type LintedListNode } from '../common/lazyLinkedList.js';

export type Token<K, V extends string = string> = {
  kind: K;
  value: V;
  start: number;
  end: number;
};

export type AnyToken<K = any, V extends string = string> = Token<K, V>;

export type InferTokenValue<T> = T extends Token<any, infer U> ? U : never;

export type TokenizerStep<Token extends AnyToken = AnyToken> = LintedListNode<Token>;

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

type InferHandlerResult<T> = T extends Handler<infer U> ? Exclude<U, null> : never;

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
  const list = new LazyLinkedList<AnyToken>(() => (chars.isDone() ? null : handler(chars)));
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
    return {
      kind,
      value: result.value,
      start: result.start,
      end: result.end,
    } as CurrentToken;
  };

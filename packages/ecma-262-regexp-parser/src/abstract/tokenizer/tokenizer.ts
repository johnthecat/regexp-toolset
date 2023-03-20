import { createStringStream, type InputStreamIterator } from '../inputStream.js';
import { LazyTokenLinkedList, type LinkedListNode } from './lazyTokenLinkedList.js';
import type { AnyToken } from './entities.js';

export type TokenizerIterator<T extends LinkedListNode> = Iterator<T, null>;

export type TokenizerIterable<T extends LinkedListNode> = {
  [Symbol.iterator](): TokenizerIterator<T>;
};

export type TokenizerApi<T extends AnyToken> = TokenizerIterable<LinkedListNode<T>> & {
  isFirstToken(token: T | LinkedListNode<T>): boolean;
  isLastToken(token: T | LinkedListNode<T>): boolean;
  getFirstStep(): LinkedListNode<T> | null;
  iterate(step: LinkedListNode<T>): TokenizerIterable<LinkedListNode<T>>;
};

export type Tokenizer<T extends AnyToken = AnyToken> = TokenizerApi<T>;

export type Handler<T extends AnyToken> = (inputStream: InputStreamIterator) => T | null;

type InferHandlerResult<T> = T extends Handler<infer U> ? Exclude<U, null> : never;

export const createStepIterator = <T extends LinkedListNode>(step: T | null): TokenizerIterator<T> => {
  let currentToken: LinkedListNode | null = step;
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

export const createStepIterable = <T extends LinkedListNode>(step: T | null): TokenizerIterable<T> => {
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
  const list = new LazyTokenLinkedList<AnyToken>(() => (chars.isDone() ? null : handler(chars)));
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
  <CurrentToken extends AnyToken>(
    kind: CurrentToken['kind'],
    regexp: RegExp,
    valueMapper?: (x: string) => string,
  ): Handler<CurrentToken> =>
  input => {
    const result = input.collect(regexp);
    if (!result) {
      return null;
    }
    return {
      kind,
      value: valueMapper ? valueMapper(result.value) : result.value,
      start: result.start,
      end: result.end,
    } as CurrentToken;
  };

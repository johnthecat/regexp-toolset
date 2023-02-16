import { createStringStream, type InputStreamIterator } from './inputStream.js';
import { LazyLinkedList, type LintedListNode } from '../common/linkedList.js';

export type Token<K, V extends string = string> = {
  kind: K;
  value: V;
  start: number;
  end: number;
};

export type AnyToken<T extends string = any> = Token<T>;

export type TokenizerStep<T extends AnyToken = any> = LintedListNode<T, 'token'>;

export type TokenizerIterator<T extends AnyToken> = {
  isFirstToken(token: T): boolean;
  isLastToken(token: T): boolean;
  start(): TokenizerStep<T> | null;
  [Symbol.iterator](): Iterator<TokenizerStep<T>, null>;
};

export type Tokenizer<T extends AnyToken = AnyToken> = TokenizerIterator<T>;

export type Handler<T extends AnyToken> = (inputStream: InputStreamIterator) => T | null;

export type InferTokenFromTokenizer<T extends (input: string) => Tokenizer> = T extends (
  input: string,
) => Tokenizer<infer U>
  ? U
  : never;

export type InferTokenizer<T extends (input: string) => Tokenizer> = T extends ((
  input: string,
) => infer U extends Tokenizer)
  ? U
  : never;

export type InferHandlerResult<T extends Handler<any>> = T extends Handler<infer U> ? Exclude<U, null> : never;
export const createTokenizer = <T extends Handler<AnyToken>>(
  handler: T,
): ((input: string) => Tokenizer<InferHandlerResult<T>>) => {
  return input => {
    const stream = createStringStream(input);
    const chars = stream.chars();
    const list = new LazyLinkedList<InferHandlerResult<T>, 'token'>(() =>
      chars.isDone() ? null : ['token', handler(chars) as InferHandlerResult<T>],
    );

    const api: Tokenizer<InferHandlerResult<T>> = {
      isFirstToken: token => token.start === 0,
      isLastToken: token => token.end === stream.size() - 1,
      start: () => list.getHead(),
      [Symbol.iterator]() {
        let currentNode: TokenizerStep<InferHandlerResult<T>> | null = null;
        let done = false;
        return {
          next: () => {
            if (done) {
              return { done: true, value: null };
            }

            const nextNode = currentNode ? list.getTail()?.next() ?? null : list.getHead();
            if (!nextNode) {
              done = true;
              return { done: true, value: null };
            }

            currentNode = nextNode;
            return { done: false, value: nextNode };
          },
        };
      },
    };
    return api;
  };
};

export const createToken = <K, V extends string>(kind: K, value: V, start: number, end: number): Token<K, V> => ({
  kind,
  value,
  start,
  end,
});

export const createHandler = <K, V extends string = string>(kind: K, regexp: RegExp): Handler<Token<K, V>> => {
  return input => {
    const result = input.collect(regexp);
    if (!result) {
      return null;
    }
    return createToken(kind, result.value as V, result.start, result.end);
  };
};

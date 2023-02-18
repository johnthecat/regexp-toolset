import { createStringStream, type InputStreamIterator } from './inputStream.js';
import { LazyLinkedList, type LintedListNode } from '../common/linkedList.js';

export type Token<K, V extends string = string> = {
  kind: K;
  value: V;
  start: number;
  end: number;
};

export type AnyToken<T extends string = any, V extends string = any> = Token<T, V>;

export type TokenizerStep<
  CurrentToken extends AnyToken = AnyToken,
  NextTokens extends AnyToken = CurrentToken,
> = LintedListNode<CurrentToken, NextTokens>;

export type TokenMatcherResult<T extends TokenizerStep> = IteratorResult<T, T> & {
  match: boolean;
};
export type TokenMatcherFn<T extends TokenizerStep> = (step: T) => TokenMatcherResult<T>;

export type TokenReducerResult<Step extends TokenizerStep, Result> = IteratorResult<Step, Step> & {
  result: Result;
};

export type TokenReducerFn<T extends TokenizerStep, R> = (step: T, result: R) => TokenReducerResult<T, R>;

export type TokenizerIterator<T extends TokenizerStep> = Iterator<T, null>;

export type TokenizerIterable<T extends TokenizerStep> = {
  [Symbol.iterator](): TokenizerIterator<T>;
};

export type TokenizerApi<T extends AnyToken> = TokenizerIterable<TokenizerStep<T>> & {
  isFirstToken(token: T): boolean;
  isLastToken(token: T): boolean;
  getFirstStep(): TokenizerStep<T> | null;
  match(step: TokenizerStep<T>, fn: TokenMatcherFn<TokenizerStep<T>>): TokenizerStep<T>;
  reducer<R>(
    step: TokenizerStep<T>,
    fn: TokenReducerFn<TokenizerStep<T>, R>,
    initial: R,
  ): TokenReducerResult<TokenizerStep<T>, R>;
};

export type Tokenizer<T extends AnyToken = AnyToken> = TokenizerApi<T>;

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

export const createStepIterable = (step: TokenizerStep): TokenizerIterable<TokenizerStep> => {
  return {
    [Symbol.iterator]() {
      let currentNode: typeof step | null = step;
      return {
        next: () => {
          if (!currentNode) {
            return { done: true, value: null };
          }

          const nodeToReturn = currentNode;
          currentNode = currentNode.next();
          return { done: false, value: nodeToReturn };
        },
      };
    },
  };
};

export const createTokenizer = <T extends Handler<AnyToken>>(
  handler: T,
): ((input: string) => Tokenizer<InferHandlerResult<T>>) => {
  type InnerStep = TokenizerStep;

  return input => {
    const stream = createStringStream(input);
    const chars = stream.chars();
    const list = new LazyLinkedList<AnyToken>(() => (chars.isDone() ? null : handler(chars)));
    const api: Tokenizer = {
      isFirstToken: token => token.start === 0,
      isLastToken: token => token.end === stream.size(),
      getFirstStep: () => list.getHead(),
      match(step, matcher) {
        let currentStep: InnerStep = step;
        while (currentStep) {
          const result = matcher(currentStep);
          if (result.done) {
            currentStep = result.value;
            break;
          }
          const nextStep = result.value.next() ?? null;
          if (!nextStep) {
            break;
          }
          currentStep = nextStep;
        }
        return currentStep;
      },
      reducer: <Result>(step: InnerStep, fn: TokenReducerFn<InnerStep, Result>, initial: Result) => {
        let currentReturn: TokenReducerResult<InnerStep, Result> = {
          done: true,
          value: step,
          result: initial,
        };
        while (currentReturn) {
          const result = fn(currentReturn.value, currentReturn.result);
          if (result.done) {
            currentReturn = result;
            break;
          }
          const nextStep = result.value.next() ?? null;
          if (!nextStep) {
            break;
          }
          currentReturn = {
            done: false,
            result: result.result,
            value: nextStep,
          };
        }
        return currentReturn;
      },
      [Symbol.iterator]() {
        let currentNode: InnerStep | null = list.getHead();
        return {
          next: () => {
            if (!currentNode) {
              return { done: true, value: null };
            }

            const nodeToReturn = currentNode;
            currentNode = currentNode.next();
            return { done: false, value: nodeToReturn };
          },
        };
      },
    };
    return api as Tokenizer<InferHandlerResult<T>>;
  };
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

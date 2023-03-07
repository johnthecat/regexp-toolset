import type { AnyRegexpToken, Step } from './regexpTokenizer.js';
import { isDecimalEscapeToken, isDecimalToken, isPatternCharToken, TokenKind } from './regexpTokenizer.js';
import { isBoolean } from './common/typeCheckers.js';
import type { NodePosition } from './regexpNodes.js';
import * as match from './common/monads/match.js';

type FullMatcherResult<V> = match.Match<{ value: NonNullable<V> | null; token: Step }>;
type MatcherResult<V> = boolean | FullMatcherResult<V>;

type CustomMatcher<V> = (token: Step) => MatcherResult<V>;

type Matcher<V, T extends AnyRegexpToken = AnyRegexpToken> = T['kind'] | Partial<T> | CustomMatcher<V>;
type MatcherList<V, T extends AnyRegexpToken = AnyRegexpToken> = Matcher<V, T>[];

const kindMatcher = <V>(a: AnyRegexpToken, b: TokenKind): MatcherResult<V> => {
  return a.kind === b;
};
const partialMatcher = <V>(token: Record<string, unknown>, fields: Record<string, unknown>): MatcherResult<V> => {
  for (const key in fields) {
    if (!(key in token)) {
      return false;
    }
    if (token[key] !== fields[key]) {
      return false;
    }
  }
  return true;
};

const applyMatcher = <V>(token: Step, matcher: Matcher<V>): FullMatcherResult<V> => {
  let result: MatcherResult<V>;

  if (typeof matcher === 'number') {
    result = kindMatcher(token, matcher);
  } else if (typeof matcher === 'function') {
    result = matcher(token);
  } else {
    result = partialMatcher(token, matcher);
  }

  return isBoolean(result) ? (result ? match.matched({ value: null, token }) : match.unmatched()) : result;
};

type MatchedSeqResult<V> = match.Match<NodePosition & { values: NonNullable<V>[]; token: Step }>;

export const matchTokenSequence = <V>(token: Step, seq: (Matcher<V> | MatcherList<V>)[]): MatchedSeqResult<V> => {
  let intermediateResult: MatchedSeqResult<V> = match.matched({
    token,
    values: [],
    start: token.start,
    end: token.end,
  });

  for (const condition of seq) {
    intermediateResult = intermediateResult
      .matched(({ start, values, token: currentToken }) => {
        if (Array.isArray(condition)) {
          return match.all(...condition.map(x => applyMatcher(currentToken, x))).map(res => {
            const value = res.find(v => v.value !== null)?.value ?? null;
            const token = res.at(-1)?.token ?? currentToken;
            return {
              token,
              values: value !== null ? values.concat(value) : values,
              start,
              end: token.end,
            };
          });
        }

        return applyMatcher(currentToken, condition).map(({ token, value }) => ({
          token,
          values: value !== null ? values.concat(value) : values,
          start,
          end: token.end,
        }));
      })
      .matched(({ token, ...etc }) => {
        const next = token.next();
        if (!next) {
          return match.unmatched();
        }
        return match.matched({
          token: next,
          ...etc,
        });
      });
  }

  return intermediateResult.map(({ token, ...etc }) => ({ token: token.prev(), ...etc }));
};

const wordRegexp = /\w/;
export const wordMatcher: CustomMatcher<string> = (token: Step) => {
  let wordMatched = false;
  let last: Step = token;
  let current: Step | null = token;
  let value = '';
  do {
    if (wordRegexp.test(current.value)) {
      wordMatched = true;
      last = current;
      value += current.value;
    } else {
      break;
    }
  } while ((current = current.next()));
  return wordMatched ? match.matched({ value, token: last }) : match.unmatched();
};

export const numberMatcher: CustomMatcher<number> = step => {
  let numberMatched = false;
  let last: Step = step;
  let current: Step | null = step;
  let value = '';
  do {
    if (isDecimalToken(current) || isDecimalEscapeToken(current)) {
      numberMatched = true;
      last = current;
      value += current.value;
    } else {
      break;
    }
  } while ((current = current.next()));

  return numberMatched ? match.matched({ value: parseInt(value), token: last }) : match.unmatched();
};

export const octalMatcher: CustomMatcher<string> = firstToken => {
  const secondToken = firstToken.next();
  if (!secondToken) {
    return match.unmatched();
  }
  const thirdToken = secondToken.next();
  if (!thirdToken) {
    return match.unmatched();
  }

  let value = '';

  for (const token of [firstToken, secondToken, thirdToken]) {
    if ((token === firstToken && isDecimalEscapeToken(token)) || isDecimalToken(token)) {
      const num = parseInt(token.value);
      if (num > 7 || num < 0) {
        return match.unmatched();
      }

      value = value + token.value;
      if (parseInt(value) > 377) {
        return match.unmatched();
      }
    }
  }

  return value.length ? match.matched({ value, token: thirdToken }) : match.unmatched();
};

export const hexMatcher: CustomMatcher<string> = firstToken => {
  const secondToken = firstToken.next();
  if (!secondToken) {
    return match.unmatched();
  }

  let value = '';
  for (const token of [firstToken, secondToken]) {
    if ((isPatternCharToken(token) || isDecimalToken(token)) && /^[0-9A-Fa-f]$/.test(token.value)) {
      value += token.value;
    } else {
      return match.unmatched();
    }
  }

  return match.matched({ value, token: secondToken });
};

export const curlyBracketOpenMatcher: MatcherList<never> = [TokenKind.SyntaxChar, { value: '{' }];
export const curlyBracketCloseMatcher: MatcherList<never> = [TokenKind.SyntaxChar, { value: '}' }];
export const chevronsOpenMatcher: MatcherList<never> = [TokenKind.PatternChar, { value: '<' }];
export const chevronsCloseMatcher: MatcherList<never> = [TokenKind.PatternChar, { value: '>' }];
export const equalsMatcher: MatcherList<never> = [TokenKind.PatternChar, { value: '=' }];
export const questionMarkMatcher: MatcherList<never> = [TokenKind.SyntaxChar, { value: '?' }];
export const parenthesisOpenMatcher: MatcherList<never> = [TokenKind.SyntaxChar, { value: '(' }];
export const parenthesisCloseMatcher: MatcherList<never> = [TokenKind.SyntaxChar, { value: ')' }];

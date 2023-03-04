import type { AnyRegexpToken, Step, TokenKind } from './regexpTokenizer.js';
import { isDecimalEscapeToken, isDecimalToken, isPatternCharToken } from './regexpTokenizer.js';
import { isBoolean } from './common/typeCheckers.js';
import type { NodePosition } from './regexpNodes.js';
import { matched, unmatched, type Monad, matchSeq } from './common/match.js';

type FullMatcherResult<V> = Monad<{ value: NonNullable<V> | null; token: Step }, unknown>;
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

  return isBoolean(result) ? (result ? matched({ value: null, token }) : unmatched(null)) : result;
};

type MatchedSeqResult<V> = Monad<NodePosition & { values: NonNullable<V>[]; token: Step }, unknown>;

// TODO fix
export const matchTokenSequence = <V>(token: Step, seq: (Matcher<V> | MatcherList<V>)[]): MatchedSeqResult<V> => {
  let intermediateResult: MatchedSeqResult<V> = matched({
    token,
    values: [],
    start: token.start,
    end: token.end,
  });

  for (const condition of seq) {
    intermediateResult = intermediateResult.matched(({ start, values, token: currentToken }) => {
      if (Array.isArray(condition)) {
        return matchSeq(condition.map(x => applyMatcher(currentToken, x))).map(res => {
          const value = res.find(v => v.value !== null)?.value ?? null;
          const token = res.sort((a, b) => b.token.index - a.token.index).at(0)?.token ?? currentToken;
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
    });

    intermediateResult = intermediateResult.matched(({ token, ...etc }) => {
      const next = token.next();
      if (!next) {
        return unmatched(null);
      }
      return matched({
        token: next,
        ...etc,
      });
    });
  }

  return intermediateResult.map(({ token, ...etc }) => ({ token: token.prev(), ...etc }));
};

export const wordMatcher: CustomMatcher<string> = (token: Step) => {
  let match = false;
  let last: Step = token;
  let current: Step | null = token;
  let value = '';
  do {
    if (/\w/.test(current.value)) {
      match = true;
      last = current;
      value += current.value;
    } else {
      break;
    }
  } while ((current = current.next()));

  return match ? matched({ value, token: last }) : unmatched({ value, token: last });
};

export const numberMatcher: CustomMatcher<number> = step => {
  let match = false;
  let last: Step = step;
  let current: Step | null = step;
  let value = '';
  do {
    if (isDecimalToken(current) || isDecimalEscapeToken(current)) {
      match = true;
      last = current;
      value += current.value;
    } else {
      break;
    }
  } while ((current = current.next()));

  return match ? matched({ value: parseInt(value), token: last }) : unmatched({ value: 0, token: last });
};

export const octalMatcher: CustomMatcher<string> = firstToken => {
  const secondToken = firstToken.next();
  if (!secondToken) {
    return unmatched({ value: '', token: firstToken });
  }
  const thirdToken = secondToken.next();
  if (!thirdToken) {
    return unmatched({ value: '', token: secondToken });
  }

  let value = '';

  for (const token of [firstToken, secondToken, thirdToken]) {
    if ((token === firstToken && isDecimalEscapeToken(token)) || isDecimalToken(token)) {
      const num = parseInt(token.value);
      if (num > 7 || num < 0) {
        return unmatched({ value, token });
      }

      value = value + token.value;
      if (parseInt(value) > 377) {
        return unmatched({ value, token });
      }
    }
  }

  return value.length ? matched({ value, token: thirdToken }) : unmatched({ value, token: thirdToken });
};

export const hexMatcher: CustomMatcher<string> = firstToken => {
  const secondToken = firstToken.next();
  if (!secondToken) {
    return unmatched({ value: '', token: firstToken });
  }

  let value = '';
  for (const token of [firstToken, secondToken]) {
    if ((isPatternCharToken(token) || isDecimalToken(token)) && /^[0-9A-Fa-f]$/.test(token.value)) {
      value += token.value;
    } else {
      return unmatched({ value, token });
    }
  }

  return matched({ value, token: secondToken });
};

import type { LinkedListNode } from './abstract/tokenizer/lazyTokenLinkedList.js';
import type { AnyRegexpToken, CharEscapeToken, PatternCharToken, SyntaxCharToken } from './regexpTokenizer.js';
import { isDecimalEscapeToken, isDecimalToken, isPatternCharToken, TokenKind } from './regexpTokenizer.js';
import { isBoolean, isFunction, isNumber, type IsVoid } from './common/typeCheckers.js';
import { ok, none, all, type Match } from './common/fp/match.js';
import { set, view, type Lens } from './common/fp/lens.js';
import { memo } from './common/memo.js';
import type { NodePosition } from './regexpNodes.js';
import { pipe2 } from './common/pipe.js';

type FullMatcherResultValue<V> = { value: V; token: LinkedListNode };
type FullMatcherResult<V> = Match<FullMatcherResultValue<V>>;
type MatcherResult<V> = boolean | FullMatcherResult<V>;

type CustomMatcher<V> = (x: FullMatcherResultValue<V>) => MatcherResult<V>;

type Matcher<V, T extends AnyRegexpToken = AnyRegexpToken> = T['kind'] | Partial<T> | CustomMatcher<V>;
type MatcherList<V, T extends AnyRegexpToken = AnyRegexpToken> = Matcher<V, T>[];

type MatchedSeqResult<V> = NodePosition & { value: V; token: LinkedListNode };

export const matchTokenSequence = <V = void>(
  ...[token, seq, initialValue]: IsVoid<V> extends true
    ? [token: LinkedListNode, seq: (Matcher<V> | MatcherList<V>)[]]
    : [token: LinkedListNode, seq: (Matcher<V> | MatcherList<V>)[], initialValue: V]
): Match<MatchedSeqResult<V>> => {
  let lastToken = token;
  let intermediateResult: MatchedSeqResult<V> = {
    token,
    value: initialValue as V,
    start: token.start,
    end: token.end,
  };

  for (const condition of seq) {
    const { token: currentToken, value, start } = intermediateResult;
    let result: Match<MatchedSeqResult<V>>;

    if (Array.isArray(condition)) {
      result = all(condition.map(x => applyMatcher(currentToken, x, value))).map(res => {
        const nextValue = res.find(v => v.value !== value)?.value ?? value;
        const token = res.at(-1)?.token ?? currentToken;
        return {
          token,
          value: nextValue,
          start,
          end: token.end,
        };
      });
    } else {
      result = applyMatcher(currentToken, condition, value).map(({ token, value }) => ({
        token,
        value,
        start,
        end: token.end,
      }));
    }

    const unwrapped = result.unwrap();
    if (!unwrapped.match) {
      return result;
    }

    const nextToken = unwrapped.value.token.next();
    if (!nextToken) {
      return none();
    }

    lastToken = unwrapped.value.token;
    unwrapped.value.token = nextToken;
    intermediateResult = unwrapped.value;
  }

  intermediateResult.token = lastToken;
  return ok(intermediateResult);
};

const applyMatcher = <V>(token: LinkedListNode, matcher: Matcher<V>, value: V): FullMatcherResult<V> => {
  let result: MatcherResult<V>;

  if (isNumber(matcher)) {
    result = kindMatcher(token, matcher);
  } else if (isFunction(matcher)) {
    result = matcher({ token, value });
  } else {
    result = patternMatcher(token, matcher);
  }

  return isBoolean(result) ? (result ? ok({ value, token }) : none()) : result;
};

const kindMatcher = <V>(a: AnyRegexpToken, b: TokenKind): MatcherResult<V> => {
  return a.kind === b;
};
const patternMatcher = <V>(token: Record<any, any>, fields: Record<string, unknown>): MatcherResult<V> => {
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

const wordRegexp = /\w/;
export const wordMatcher: CustomMatcher<string> = ({ token, value: prevValue }) => {
  let wordMatched = false;
  let last: LinkedListNode = token;
  let current: LinkedListNode | null = token;
  let value = prevValue;
  do {
    if (wordRegexp.test(current.value)) {
      wordMatched = true;
      last = current;
      value += current.value;
    } else {
      break;
    }
  } while ((current = current.next()));
  return wordMatched ? ok({ value, token: last }) : none();
};

export const numberMatcher: CustomMatcher<number> = ({ token, value: prevValue }) => {
  let numberMatched = false;
  let last: LinkedListNode = token;
  let current: LinkedListNode | null = token;
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

  return numberMatched ? ok({ value: prevValue + parseInt(value), token: last }) : none();
};

export const octalMatcher: CustomMatcher<string> = ({ token: firstToken }) => {
  const secondToken = firstToken.next();
  if (!secondToken) {
    return none();
  }
  const thirdToken = secondToken.next();
  if (!thirdToken) {
    return none();
  }

  let value = '';

  for (const token of [firstToken, secondToken, thirdToken]) {
    if ((token === firstToken && isDecimalEscapeToken(token)) || isDecimalToken(token)) {
      const num = parseInt(token.value);
      if (num > 7 || num < 0) {
        return none();
      }

      value = value + token.value;
      if (parseInt(value) > 377) {
        return none();
      }
    }
  }

  return value.length ? ok({ value, token: thirdToken }) : none();
};

export const hexMatcher: CustomMatcher<string> = ({ token: firstToken, value: prevValue }) => {
  const secondToken = firstToken.next();
  if (!secondToken) {
    return none();
  }

  let value = prevValue;
  for (const token of [firstToken, secondToken]) {
    if ((isPatternCharToken(token) || isDecimalToken(token)) && /^[0-9A-Fa-f]$/.test(token.value)) {
      value += token.value;
    } else {
      return none();
    }
  }

  return ok({ value, token: secondToken });
};

export const createPatternCharMatcher = memo((value: PatternCharToken['value']) => [TokenKind.PatternChar, { value }]);
export const createSyntaxCharMatcher = memo((value: SyntaxCharToken['value']) => [TokenKind.SyntaxChar, { value }]);
export const createCharEscapeMatcher = memo((value: CharEscapeToken['value']) => [TokenKind.CharEscape, { value }]);

export const mapMatcher = <Original, Mapped>(
  matcher: CustomMatcher<Original>,
  valueL: Lens<Mapped, Original>,
): CustomMatcher<Mapped> => {
  const viewValue = view(valueL);
  const setValue = set(valueL);
  const viewMatchedValue = pipe2(viewMatcherResultValue, viewValue);

  return x => {
    const result = matcher(setMatcherResultValue(x, viewMatchedValue(x)));
    return isBoolean(result) ? result : result.map(y => setMatcherResultValue(y, setValue(x.value, y.value)));
  };
};

export const matcherResultValueL: Lens<FullMatcherResultValue<any>, any> = (f, x) => ({ ...x, value: f(x.value) });
export const viewMatcherResultValue = view(matcherResultValueL);
export const setMatcherResultValue = set(matcherResultValueL);

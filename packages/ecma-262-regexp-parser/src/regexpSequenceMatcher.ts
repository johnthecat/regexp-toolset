import type { TokenMatchReducerFn, TokenMatchReducerResult } from './abstract/tokenizer.js';
import type { AnyRegexpToken, Step, TokenKind } from './regexpTokenizer.js';
import { isDecimalEscapeToken, isDecimalToken, isPatternCharToken } from './regexpTokenizer.js';
import { isBoolean } from './common/typeCheckers.js';
import { matchedToken, unmatchedToken } from './regexpParseUtils.js';

type FullMatcherResult<V> = TokenMatchReducerResult<Step, V | null>;
type MatcherResult<V> = boolean | FullMatcherResult<V | null>;

type CustomMatcher<V> = TokenMatchReducerFn<Step, V>;

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

const applyMatcher = <V>(step: Step, matcher: Matcher<V>): FullMatcherResult<V | null> => {
  let result: MatcherResult<V>;

  if (typeof matcher === 'number') {
    result = kindMatcher(step, matcher);
  } else if (typeof matcher === 'function') {
    result = matcher(step, null as V);
  } else {
    result = partialMatcher(step, matcher);
  }

  return {
    match: isBoolean(result) ? result : result.match,
    done: isBoolean(result) ? true : result.done ?? false,
    value: isBoolean(result) ? step : result.value,
    result: isBoolean(result) ? null : result.result,
  };
};

export const matchTokenSequence = <V>(
  step: Step,
  seq: (Matcher<V> | MatcherList<V>)[],
): { match: boolean; values: V[]; lastStep: Step; start: number; end: number } => {
  let prevStep: Step = step;
  let currentStep: Step = step;
  const values: V[] = [];

  const execMatchersForCondition = (step: Step, condition: Matcher<V>): boolean => {
    const result = applyMatcher(step, condition);
    if (result.match) {
      currentStep = result.value;
      if (result.result !== null) {
        values.push(result.result);
      }
    }

    return result.match;
  };

  for (const condition of seq) {
    if (Array.isArray(condition)) {
      for (const conditionItem of condition) {
        if (!execMatchersForCondition(currentStep, conditionItem)) {
          return {
            match: false,
            lastStep: currentStep,
            start: step.start,
            end: currentStep.end,
            values,
          };
        }
      }
    } else {
      const match = execMatchersForCondition(currentStep, condition);
      if (!match) {
        return {
          match: false,
          lastStep: currentStep,
          start: step.start,
          end: currentStep.end,
          values,
        };
      }
    }

    const nextStep = currentStep?.next();
    if (!nextStep) {
      return {
        match: false,
        lastStep: currentStep,
        start: step.start,
        end: currentStep.end,
        values,
      };
    }
    prevStep = currentStep;
    currentStep = nextStep;
  }

  return {
    match: true,
    lastStep: prevStep,
    start: step.start,
    end: prevStep?.end,
    values,
  };
};

export const wordMatcher: CustomMatcher<string> = (step: Step) => {
  let match = false;
  let last: Step = step;
  let current: Step | null = step;
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

  return match ? matchedToken(last, value) : unmatchedToken(last, value);
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

  return match ? matchedToken(last, parseInt(value)) : unmatchedToken(last, 0);
};

export const octalMatcher: CustomMatcher<string> = firstStep => {
  const secondStep = firstStep.next();
  if (!secondStep) {
    return unmatchedToken(firstStep, '');
  }
  const thirdStep = secondStep.next();
  if (!thirdStep) {
    return unmatchedToken(secondStep, '');
  }

  let value = '';

  for (const step of [firstStep, secondStep, thirdStep]) {
    if ((step === firstStep && isDecimalEscapeToken(step)) || isDecimalToken(step)) {
      const num = parseInt(step.value);
      if (num > 7 || num < 0) {
        return unmatchedToken(step, value);
      }

      value = value + step.value;
      if (parseInt(value) > 377) {
        return unmatchedToken(step, value);
      }
    }
  }

  return value.length ? matchedToken(thirdStep, value) : unmatchedToken(thirdStep, value);
};

export const hexMatcher: CustomMatcher<string> = firstStep => {
  const secondStep = firstStep.next();
  if (!secondStep) {
    return unmatchedToken(firstStep, '');
  }

  let value = '';
  for (const step of [firstStep, secondStep]) {
    if ((isPatternCharToken(step) || isDecimalToken(step)) && /^[0-9A-Fa-f]$/.test(step.value)) {
      value += step.value;
    } else {
      return unmatchedToken(step, value);
    }
  }

  return matchedToken(secondStep, value);
};

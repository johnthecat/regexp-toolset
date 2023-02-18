import type { AnyRegexpToken, Step, TokenKind } from './regexpTokenizer.js';
import { isPatternCharToken, isDecimalToken, isDecimalEscapeToken } from './regexpTokenizer.js';
import type { AnyRegexpNode, NodePosition, ZeroLengthNode } from './regexpNodes.js';
import type { ParserState, TokenParser } from './regexpParseTypes.js';
import { isBoolean } from './common/typeCheckers.js';
import { SyntaxKind } from './regexpNodes.js';
import { createAlternativeNode, createSimpleNode } from './regexpNodeFactory.js';

export const fillExpressions = (
  step: Step,
  state: ParserState,
  tokenParser: TokenParser,
): { expressions: AnyRegexpNode[]; lastStep: Step } => {
  const reducerResult = state.tokenizer.reducer<AnyRegexpNode[]>(
    step,
    (currentStep, expressions) => tokenParser(currentStep, expressions, state),
    [],
  );

  return { expressions: reducerResult.result, lastStep: reducerResult.value };
};

type FullMatcherResult<V> = { step: Step; match: boolean; value: V | null };
type MatcherResult<V> = boolean | FullMatcherResult<V>;

type CustomMatcher<V> = (step: Step) => MatcherResult<V>;

type Matcher<V, T extends AnyRegexpToken = AnyRegexpToken> = T['kind'] | Partial<T> | CustomMatcher<V>;
type MatcherList<V, T extends AnyRegexpToken = AnyRegexpToken> = Matcher<V, T>[];

const kindMatcher = <V>(a: Step, b: TokenKind): MatcherResult<V> => {
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

const applyMatcher = <V>(step: Step, matcher: Matcher<V>): FullMatcherResult<V> => {
  let result: MatcherResult<V>;

  if (typeof matcher === 'number') {
    result = kindMatcher(step, matcher);
  } else if (typeof matcher === 'function') {
    result = matcher(step);
  } else {
    result = partialMatcher(step, matcher);
  }

  return {
    match: isBoolean(result) ? result : result.match,
    step: isBoolean(result) ? step : result.step,
    value: isBoolean(result) ? null : result.value,
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
      currentStep = result.step;
      if (result.value !== null) {
        values.push(result.value);
      }
    }

    return result.match;
  };

  for (const condition of seq) {
    if (Array.isArray(condition)) {
      const start = currentStep;
      for (const conditionItem of condition) {
        if (!execMatchersForCondition(start, conditionItem)) {
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

export const wordMatcher = (step: Step) => {
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

  return { step: last, match, value };
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

  return { step: last, match, value: parseInt(value) };
};

export const octalMatcher: CustomMatcher<string> = firstStep => {
  const secondStep = firstStep.next();
  if (!secondStep) {
    return false;
  }
  const thirdStep = secondStep.next();
  if (!thirdStep) {
    return false;
  }

  let value = '';

  for (const step of [firstStep, secondStep, thirdStep]) {
    if ((step === firstStep && isDecimalEscapeToken(step)) || isDecimalToken(step)) {
      value = value + step.value;
      if (parseInt(value) > 256) {
        return false;
      }
    }
  }

  return { match: value !== '', step: thirdStep, value };
};

export const hexMatcher: CustomMatcher<string> = firstStep => {
  const secondStep = firstStep.next();
  if (!secondStep) {
    return false;
  }

  let value = '';

  for (const step of [firstStep, secondStep]) {
    if (
      (isPatternCharToken(step) || isDecimalToken(step) || isDecimalEscapeToken(step) || isDecimalEscapeToken(step)) &&
      /^[0-9A-Fa-f]$/.test(step.value)
    ) {
      value += step.value;
    } else {
      return false;
    }
  }

  return { match: true, step: secondStep, value };
};

export const sealExpressions = (
  expressions: AnyRegexpNode[],
  firstToken: NodePosition | void = expressions.at(0),
  lastToken: NodePosition | void = expressions.at(-1),
): AnyRegexpNode => {
  if (!expressions.length) {
    return createSimpleNode<ZeroLengthNode>(SyntaxKind.ZeroLength, {
      start: firstToken?.start ?? 0,
      end: lastToken?.end ?? 0,
    });
  }

  if (expressions.length === 1) {
    return (
      expressions.at(0) ??
      createSimpleNode<ZeroLengthNode>(SyntaxKind.ZeroLength, {
        start: firstToken?.start ?? 0,
        end: lastToken?.end ?? 0,
      })
    );
  }

  return createAlternativeNode(expressions);
};

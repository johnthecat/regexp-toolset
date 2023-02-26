import type { Step } from './regexpTokenizer.js';
import type { AnyRegexpNode, NodePosition, ZeroLengthNode } from './regexpNodes.js';
import type { ParserContext, TokenParser, TokenParserResult } from './regexpParseTypes.js';
import { SyntaxKind } from './regexpNodes.js';
import { createAlternativeNode, createSimpleNode } from './regexpNodeFactory.js';
import type { TokenMatchReducerFn, TokenMatchReducerResult } from './abstract/tokenizer.js';

export const fillExpressions = (
  token: Step,
  state: ParserContext,
  tokenParser: TokenParser,
): { expressions: AnyRegexpNode[]; lastStep: Step } => {
  const reducerResult = state.tokenizer.reduce<AnyRegexpNode[]>(
    token,
    (currentToken, expressions) => tokenParser(currentToken, expressions, state),
    [],
  );

  return { expressions: reducerResult.result, lastStep: reducerResult.value };
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

export const matchFirst = <T extends Step>(
  token: T,
  expressions: AnyRegexpNode[],
  matchers: TokenMatchReducerFn<T, AnyRegexpNode[], Step>[],
  defaultReturn?: TokenParserResult,
): TokenParserResult => {
  let lastExpressions = expressions;
  for (const matcher of matchers) {
    const result = matcher(token, lastExpressions);
    if (result.match) {
      return result;
    }
    lastExpressions = result.result;
  }

  if (defaultReturn) {
    return defaultReturn;
  }
  throw new Error(`Unhandled token: ${token.value} at ${token.start}:${token.end}`);
};

export const matchedToken = <T>(token: Step, result: T): TokenMatchReducerResult<Step, T> => ({
  done: true,
  match: true,
  value: token,
  result,
});

export const unmatchedToken = <T>(token: Step, result: T): TokenMatchReducerResult<Step, T> => ({
  done: true,
  match: false,
  value: token,
  result,
});

export const forwardParser = (result: TokenParserResult): TokenParserResult => ({
  ...result,
  done: false,
});

import type { Step } from './regexpTokenizer.js';
import type { NodeParser, NodeParserResult, NodeParserResultValue, ParserContext } from './regexpParseTypes.js';
import { ok } from './common/match/match.js';

export const fillExpressions = (token: Step, ctx: ParserContext, tokenParser: NodeParser): NodeParserResult => {
  let currentParserResult: NodeParserResultValue = { nodes: [], token };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const parseResult = tokenParser(currentParserResult, ctx);
    const unwrapped = parseResult.unwrap();
    if (unwrapped.match) {
      const nextToken = unwrapped.value.token.next();
      if (!nextToken) {
        return parseResult;
      }
      currentParserResult = { nodes: unwrapped.value.nodes, token: nextToken };
    } else {
      if ('error' in unwrapped) {
        return parseResult;
      }
      return ok(currentParserResult);
    }
  }
};

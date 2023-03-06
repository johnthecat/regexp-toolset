import type { Step } from './regexpTokenizer.js';
import type { NodeParser, NodeParserResult, ParserContext } from './regexpParseTypes.js';
import { matched, errored } from './common/monads/match.js';

export const fillExpressions = (token: Step, ctx: ParserContext, tokenParser: NodeParser): NodeParserResult => {
  let currentMatch: NodeParserResult = matched({ nodes: [], token });
  let done = false;

  while (!done) {
    currentMatch = currentMatch
      .flatMap(x => tokenParser(x, ctx))
      .matched(x => {
        const nextToken = x.token.next();
        if (!nextToken) {
          done = true;
          return matched(x);
        }
        return matched({ nodes: x.nodes, token: nextToken });
      })
      .unmatched(() => {
        done = true;
        return currentMatch;
      })
      .error(error => {
        done = true;
        return errored(error);
      });
  }

  return currentMatch;
};

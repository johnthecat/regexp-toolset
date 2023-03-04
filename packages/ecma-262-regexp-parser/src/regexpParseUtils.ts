import type { Step } from './regexpTokenizer.js';
import type { NodeParser, NodeParserResult, ParserContext } from './regexpParseTypes.js';
import { errored, matched } from './common/match.js';

export const fillExpressions = (token: Step, ctx: ParserContext, tokenParser: NodeParser): NodeParserResult => {
  let currentMatch: NodeParserResult = matched({ nodes: [], token });
  let done = false;

  while (!done) {
    currentMatch = currentMatch
      .matched(({ nodes, token }) => tokenParser(token, nodes, ctx))
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
      .error(message => {
        done = true;
        return errored(message);
      });
  }

  return currentMatch;
};

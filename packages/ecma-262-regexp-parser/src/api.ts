import { createRegexpTokenizer } from './regexpTokenizer.js';
import { createParserContext, parseRegexp as parseRegexpBase, parseNodeInRegexp } from './regexpParser.js';
import type { AnyRegexpNode, RegexpNode } from './regexpNodes.js';
import { fillExpressions } from './regexpParseUtils.js';
import { sealExpressions } from './regexpNodeFactory.js';
import * as match from './common/fp/match.js';

export const parseRegexp = (source: string | RegExp): RegexpNode => {
  const rawSource = source.toString();
  const tokenizer = createRegexpTokenizer(rawSource);
  const ctx = createParserContext(rawSource, tokenizer);

  return match
    .nonNullable(tokenizer.getFirstStep())
    .orError(() => ctx.reportError({ start: 0, end: rawSource.length - 1 }, "Can't parse input"))
    .match(firstToken => parseRegexpBase(firstToken, ctx))
    .unwrapOrThrow().node;
};

export const parseRegexpNode = (source: string): AnyRegexpNode => {
  const tokenizer = createRegexpTokenizer(source);
  const ctx = createParserContext(source, tokenizer);

  const firstStep = match
    .nonNullable(tokenizer.getFirstStep())
    .orError(() => ctx.reportError({ start: 0, end: source.length - 1 }, "Can't parse input"));
  const nodes = firstStep.match(firstToken => fillExpressions(firstToken, ctx, parseNodeInRegexp));

  return match
    .all([firstStep, nodes])
    .map(([token, { nodes }]) => sealExpressions(nodes, token))
    .unwrapOrThrow();
};

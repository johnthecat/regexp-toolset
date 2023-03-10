import { createRegexpTokenizer } from './regexpTokenizer.js';
import { createParserContext, parseRegexp as parseRegexpBase, parseNodeInRegexp } from './regexpParser.js';
import type { AnyRegexpNode, RegexpNode } from './regexpNodes.js';
import { fillExpressions } from './regexpParseUtils.js';
import { sealExpressions } from './regexpNodeFactory.js';
import * as match from './common/match/match.js';

const unwrap = <T>(x: match.Match<T>): T => {
  const r = x.unwrap();
  if (r.match) {
    return r.value;
  } else {
    if ('error' in r) {
      throw r.error;
    } else {
      throw new Error('Unknown Error');
    }
  }
};

export const parseRegexp = (source: string | RegExp): RegexpNode => {
  const rawSource = source.toString();
  const tokenizer = createRegexpTokenizer(rawSource);
  const ctx = createParserContext(rawSource, tokenizer);

  const regexpNode = match
    .nonNullable(tokenizer.getFirstStep())
    .orError(() => ctx.reportError({ start: 0, end: rawSource.length - 1 }, "Can't parse input"))
    .matched(firstToken => parseRegexpBase(firstToken, ctx));

  return unwrap(regexpNode).node;
};

export const parseRegexpNode = (source: string): AnyRegexpNode => {
  const tokenizer = createRegexpTokenizer(source);
  const ctx = createParserContext(source, tokenizer);

  const firstStep = match.nonNullable(tokenizer.getFirstStep()).orError(() => ctx.reportError(0, "Can't parse input"));
  const nodes = firstStep.matched(firstToken => fillExpressions(firstToken, ctx, parseNodeInRegexp));
  const result = match.all(firstStep, nodes).map(([token, { nodes }]) => sealExpressions(nodes, token));

  return unwrap(result);
};

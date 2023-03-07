import { regexpTokenizer } from './regexpTokenizer.js';
import { createParserContext, parseRegexp as parseRegexpBase, parseNodeInRegexp } from './regexpParser.js';
import type { AnyRegexpNode, RegexpNode } from './regexpNodes.js';
import { fillExpressions } from './regexpParseUtils.js';
import { sealExpressions } from './regexpNodeFactory.js';

export const parseRegexp = (source: string | RegExp): RegexpNode => {
  const rawSource = source.toString();
  const tokenizer = regexpTokenizer(rawSource);
  const ctx = createParserContext(rawSource, tokenizer);

  const firstToken = tokenizer.getFirstStep();
  if (!firstToken) {
    throw ctx.reportError({ start: 0, end: rawSource.length - 1 }, "Can't parse input");
  }

  const regexpNode = parseRegexpBase(firstToken, ctx).unwrap();

  if (regexpNode.match) {
    return regexpNode.value.node;
  } else {
    if ('error' in regexpNode) {
      throw regexpNode.error;
    } else {
      throw new Error('Unknown Error');
    }
  }
};

export const parseRegexpNode = (source: string): AnyRegexpNode => {
  const tokenizer = regexpTokenizer(source);
  const ctx = createParserContext(source, tokenizer);

  const firstToken = tokenizer.getFirstStep();
  if (!firstToken) {
    throw ctx.reportError(0, "Can't parse input");
  }

  const result = fillExpressions(firstToken, ctx, parseNodeInRegexp)
    .map(({ nodes }) => sealExpressions(nodes, firstToken))
    .unwrap();

  if (result.match) {
    return result.value;
  } else {
    if ('error' in result) {
      throw result.error;
    } else {
      throw new Error('Unknown Error');
    }
  }
};

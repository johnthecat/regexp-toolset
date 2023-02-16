import type { AnyRegexpNode, GroupNode, SubpatternNode } from './regexpNodes.js';
import type { AnyRegexpToken, RegexpTokenizer, Step } from './regexpTokenizer.js';
import type { TokenizerStep } from './abstract/tokenizer.js';

/**
 * @return Last used step.
 */
export type PartialParser<T extends AnyRegexpToken = AnyRegexpToken> = (
  step: TokenizerStep<T>,
  expressions: AnyRegexpNode[],
  state: ParserState,
) => Step;

export type TokenParser<T extends AnyRegexpToken = AnyRegexpToken> = (
  step: TokenizerStep<T>,
  expressions: AnyRegexpNode[],
  state: ParserState,
  recursiveFn?: TokenParser,
) => {
  shouldBreak: boolean;
  lastStep: Step;
};

export type ParserState = {
  source: string;
  tokenizer: RegexpTokenizer;
  foundGroupSpecifiers: Map<string, GroupNode>;
  groupSpecifierDemands: Set<[tag: string, node: SubpatternNode]>;
};

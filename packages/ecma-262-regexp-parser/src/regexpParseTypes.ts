import type { AnyRegexpNode, GroupNode, SubpatternNode } from './regexpNodes.js';
import type { RegexpTokenizer, Step } from './regexpTokenizer.js';
import type { TokenReducerResult } from './abstract/tokenizer.js';

export type TokenParser<T extends Step = Step> = (
  step: T,
  expressions: AnyRegexpNode[],
  state: ParserState,
  recursiveFn?: TokenParser,
) => TokenReducerResult<Step, AnyRegexpNode[]>;

export type ParserState = {
  source: string;
  tokenizer: RegexpTokenizer;
  foundGroupSpecifiers: Map<string, GroupNode>;
  groupSpecifierDemands: Set<[tag: string, node: SubpatternNode]>;
};

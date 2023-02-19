import type { AnyRegexpNode, GroupNode, NodePosition, SubpatternNode } from './regexpNodes.js';
import type { RegexpTokenizer, Step } from './regexpTokenizer.js';
import type { TokenReducerResult } from './abstract/tokenizer.js';
import type { ParsingError } from './common/parsingError.js';

export type TokenParser<T extends Step = Step> = (
  step: T,
  expressions: AnyRegexpNode[],
  context: ParserContext,
  recursiveFn?: TokenParser,
) => TokenReducerResult<Step, AnyRegexpNode[]>;

export type ParserContext = {
  source: string;
  tokenizer: RegexpTokenizer;
  foundGroupSpecifiers: Map<string, GroupNode>;
  groupSpecifierDemands: Set<[tag: string, node: SubpatternNode]>;
  reportError: (position: NodePosition, message: string) => ParsingError;
};

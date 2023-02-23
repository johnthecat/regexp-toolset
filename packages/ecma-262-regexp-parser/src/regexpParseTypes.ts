import type { AnyRegexpNode, GroupNode, NodePosition, SubpatternNode } from './regexpNodes.js';
import type { RegexpTokenizer, Step } from './regexpTokenizer.js';
import type { TokenMatchReducerResult } from './abstract/tokenizer.js';
import type { ParsingError } from './common/parsingError.js';

export type TokenParserResult = TokenMatchReducerResult<Step, AnyRegexpNode[]>;

export type TokenParser<T extends Step = Step> = (
  token: T,
  expressions: AnyRegexpNode[],
  context: ParserContext,
  recursiveFn?: TokenParser,
) => TokenParserResult;

export type ParserContext = {
  source: string;
  tokenizer: RegexpTokenizer;
  foundGroupSpecifiers: Map<string, GroupNode>;
  groupSpecifierDemands: Set<[tag: string, node: SubpatternNode]>;
  reportError: (position: Partial<NodePosition> | number, message: string) => ParsingError;
};

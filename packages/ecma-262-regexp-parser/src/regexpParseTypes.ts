import type { AnyRegexpNode, GroupNode, NodePosition, SubpatternNode } from './regexpNodes.js';
import type { RegexpTokenizer, TokenStep } from './regexpTokenizer.js';
import type { ParsingError } from './common/parsingError.js';
import type { Match } from './common/fp/match.js';

// export type NodeParserResult = EitherMatch<AnyRegexpNode>;
export type NodeParserResultValue = { nodes: AnyRegexpNode[]; token: TokenStep };
export type NodeParserResult = Match<NodeParserResultValue>;
export type SingleNodeParserResult<T extends AnyRegexpNode = AnyRegexpNode> = Match<{ node: T }>;

export type NodeParser = (
  input: NodeParserResultValue,
  ctx: ParserContext,
  recursiveFn?: NodeParser,
) => NodeParserResult;

export type SingleNodeParser<T extends AnyRegexpNode = AnyRegexpNode> = (
  token: TokenStep,
  ctx: ParserContext,
) => SingleNodeParserResult<T>;

export type ParserContext = {
  source: string;
  tokenizer: RegexpTokenizer;
  groupIndex: number;
  foundGroupSpecifiers: Map<string, GroupNode>;
  groupSpecifierDemands: Set<[tag: string, node: SubpatternNode]>;
  reportError: (position: Partial<NodePosition> | number, message: string) => ParsingError;
};

import type { AnyRegexpNode, GroupNode, NodePosition, SubpatternNode } from './regexpNodes.js';
import type { RegexpTokenizer, Step } from './regexpTokenizer.js';
import type { ParsingError } from './common/parsingError.js';
import type { Monad } from './common/match.js';

// export type NodeParserResult = EitherMatch<AnyRegexpNode>;
export type NodeParserResult = Monad<{ nodes: AnyRegexpNode[]; token: Step }, unknown>;
export type SingleNodeParserResult<T extends AnyRegexpNode = AnyRegexpNode> = Monad<{ node: T; token: Step }, unknown>;

export type NodeParser = (
  token: Step,
  nodes: AnyRegexpNode[],
  ctx: ParserContext,
  recursiveFn?: NodeParser,
) => NodeParserResult;

export type SingleNodeParser<T extends AnyRegexpNode = AnyRegexpNode> = (
  token: Step,
  ctx: ParserContext,
) => SingleNodeParserResult<T>;

export type ParserContext = {
  source: string;
  tokenizer: RegexpTokenizer;
  foundGroupSpecifiers: Map<string, GroupNode>;
  groupSpecifierDemands: Set<[tag: string, node: SubpatternNode]>;
  reportError: (position: Partial<NodePosition> | number, message: string) => ParsingError;
};

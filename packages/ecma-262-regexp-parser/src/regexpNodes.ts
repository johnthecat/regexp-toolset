export type NodePosition = { start: number; end: number };

export enum SyntaxKind {
  Regexp,
  LineStart,
  LineEnd,
  Disjunction,
  CharRange,
  Alternative,
  Char,
  ASCIIControlChar,
  ControlEscapeChar,
  NullChar,
  Backspace,
  Subpattern,
  AnyChar,
  AnyDigit,
  NonDigit,
  AnyWhitespace,
  NonWhitespace,
  AnyWord,
  NonWord,
  WordBoundary,
  NonWordBoundary,
  ZeroLength,
  CharClass,
  Group,
  GroupName,
  BackReference,
  Quantifier,
  Repetition,
}

export enum QuantifierType {
  NoneOrSingle,
  NoneOrMany,
  SingleOrMany,
  Range,
}

export enum ControlEscapeCharType {
  NewLine,
  CarriageReturn,
  Tab,
  VerticalWhitespace,
  FormFeedChar,
}

export type Node<
  Kind extends SyntaxKind = SyntaxKind,
  Value extends Record<string, unknown> = Record<string, never>,
> = Value &
  NodePosition & {
    kind: Kind;
    __value?: Value;
  };

export type InferNodeKind<T> = T extends Node<infer U, Record<string, unknown>> ? U : never;
export type InferNodeValue<T> = T extends Node<SyntaxKind, infer U extends Record<string, unknown>> ? U : never;
export type InferNodeActualValue<T> = InferNodeValue<T> extends Record<string, never> ? void : InferNodeValue<T>;

export type RegexpNode = Node<SyntaxKind.Regexp, { body: AnyRegexpNode; flags: string }>;
export type LineStartNode = Node<SyntaxKind.LineStart>;
export type LineEndNode = Node<SyntaxKind.LineEnd>;
export type DisjunctionNode = Node<SyntaxKind.Disjunction, { left: AnyRegexpNode; right: AnyRegexpNode }>;
export type CharRangeNode = Node<SyntaxKind.CharRange, { from: CharNode; to: CharNode }>;
export type AlternativeNode = Node<SyntaxKind.Alternative, { expressions: AnyRegexpNode[] }>;
export type CharNode = Node<
  SyntaxKind.Char,
  { value: string; charCode: number; type: 'simple' | 'hex' | 'unicode' | 'escaped' | 'octal' }
>;
export type ASCIIControlCharNode = Node<SyntaxKind.ASCIIControlChar, { value: string }>;
export type NullCharNode = Node<SyntaxKind.NullChar>;
export type BackspaceNode = Node<SyntaxKind.Backspace>;
export type SubpatternNode = Node<SyntaxKind.Subpattern, { groupName: string; ref: GroupNode | null }>;
export type AnyCharNode = Node<SyntaxKind.AnyChar>;
export type AnyDigitNode = Node<SyntaxKind.AnyDigit>;
export type NonDigitNode = Node<SyntaxKind.NonDigit>;
export type AnyWhitespaceNode = Node<SyntaxKind.AnyWhitespace>;
export type NonWhitespaceNode = Node<SyntaxKind.NonWhitespace>;
export type AnyWordNode = Node<SyntaxKind.AnyWord>;
export type NonWordNode = Node<SyntaxKind.NonWord>;
export type WordBoundaryNode = Node<SyntaxKind.WordBoundary>;
export type NonWordBoundaryNode = Node<SyntaxKind.NonWordBoundary>;
export type ControlEscapeCharNode = Node<SyntaxKind.ControlEscapeChar, { type: ControlEscapeCharType }>;
export type ZeroLengthNode = Node<SyntaxKind.ZeroLength>;
export type CharClassNode = Node<SyntaxKind.CharClass, { negative: boolean; expressions: AnyRegexpNode[] }>;
export type GroupNameNode = Node<SyntaxKind.GroupName, { name: string }>;
export type GroupNode = Node<
  SyntaxKind.Group,
  {
    body: AnyRegexpNode;
    specifier: GroupNameNode | null;
    type:
      | 'capturing'
      | 'nonCapturing'
      | 'positiveLookahead'
      | 'negativeLookahead'
      | 'positiveLookbehind'
      | 'negativeLookbehind';
  }
>;
export type BackReferenceNode = Node<SyntaxKind.BackReference, { group: GroupNode }>;

type QuantifierNodeRangeValue = { from: number; to?: number | void };

export type QuantifierNode = Node<
  SyntaxKind.Quantifier,
  (
    | { type: QuantifierType.NoneOrMany | QuantifierType.NoneOrSingle | QuantifierType.SingleOrMany }
    | ({ type: QuantifierType.Range } & QuantifierNodeRangeValue)
  ) & {
    greedy: boolean;
  }
>;

export type RepetitionNode = Node<SyntaxKind.Repetition, { expression: AnyRegexpNode; quantifier: QuantifierNode }>;

export type AnyRegexpNode =
  | RegexpNode
  | AlternativeNode
  | QuantifierNode
  | RepetitionNode
  | LineStartNode
  | LineEndNode
  | DisjunctionNode
  | CharRangeNode
  | AnyCharNode
  | CharNode
  | ASCIIControlCharNode
  | NullCharNode
  | BackspaceNode
  | SubpatternNode
  | CharClassNode
  | GroupNameNode
  | GroupNode
  | BackReferenceNode
  | ZeroLengthNode
  | ControlEscapeCharNode
  | AnyWhitespaceNode
  | NonWhitespaceNode
  | AnyDigitNode
  | NonDigitNode
  | AnyWordNode
  | NonWordNode
  | WordBoundaryNode
  | NonWordBoundaryNode;

export type NodePosition = { start: number; end: number };

export enum SyntaxKind {
  Regexp,
  LineStart,
  LineEnd,
  Disjunction,
  CharRange,
  Alternative,
  Char,
  ControlChar,
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
  NewLine,
  CarriageReturn,
  Tab,
  VerticalWhitespace,
  FormFeedChar,
  ZeroLength,
  CharClass,
  Group,
  GroupName,
  BackReference,
  Quantifier,
  Repetition,
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
export type ControlCharNode = Node<SyntaxKind.ControlChar, { value: string }>;
export type FormFeedCharNode = Node<SyntaxKind.FormFeedChar>;
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
export type NewLineNode = Node<SyntaxKind.NewLine>;
export type CarriageReturnNode = Node<SyntaxKind.CarriageReturn>;
export type TabNode = Node<SyntaxKind.Tab>;
export type VerticalWhitespaceNode = Node<SyntaxKind.VerticalWhitespace>;
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

type QuantifierNode = Node<
  SyntaxKind.Quantifier,
  | { type: 'zeroOrOne'; greedy: boolean }
  | { type: 'oneOrMany'; greedy: boolean }
  | { type: 'zeroOrMany'; greedy: boolean }
  | ({ type: 'range' } & QuantifierNodeRangeValue)
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
  | FormFeedCharNode
  | ControlCharNode
  | NullCharNode
  | BackspaceNode
  | SubpatternNode
  | CharClassNode
  | GroupNameNode
  | GroupNode
  | BackReferenceNode
  | ZeroLengthNode
  | NewLineNode
  | CarriageReturnNode
  | VerticalWhitespaceNode
  | TabNode
  | AnyWhitespaceNode
  | NonWhitespaceNode
  | AnyDigitNode
  | NonDigitNode
  | AnyWordNode
  | NonWordNode;

export const sealExpressions = (
  expressions: AnyRegexpNode[],
  firstToken: NodePosition,
  lastToken: NodePosition,
): AnyRegexpNode => {
  if (!expressions.length) {
    return createSimpleNode<ZeroLengthNode>(SyntaxKind.ZeroLength, {
      start: firstToken.start,
      end: lastToken.end,
    });
  }

  if (expressions.length === 1) {
    return (
      expressions.at(0) ??
      createSimpleNode<ZeroLengthNode>(SyntaxKind.ZeroLength, {
        start: firstToken.start,
        end: lastToken.end,
      })
    );
  }

  return createAlternativeNode(expressions);
};

export const createNode = <T extends Node<SyntaxKind, Record<string, unknown>>>(
  kind: InferNodeKind<T>,
  { start, end }: NodePosition,
  value: InferNodeActualValue<T>,
): T =>
  ({
    kind,
    ...value,
    start,
    end,
  } as T);

export const createSimpleNode = <T extends Node>(kind: InferNodeKind<T>, { start, end }: NodePosition): T =>
  ({
    kind,
    start,
    end,
  } as unknown as T);

export const createCharNode = (value: string, position: NodePosition, type: CharNode['type']) =>
  createNode<CharNode>(SyntaxKind.Char, position, {
    type,
    value,
    charCode: value.charCodeAt(0),
  });

export const createControlCharNode = (value: string, position: NodePosition) =>
  createNode<ControlCharNode>(SyntaxKind.ControlChar, position, {
    value,
  });

export const createAlternativeNode = (expressions: AnyRegexpNode[]) =>
  createNode<AlternativeNode>(
    SyntaxKind.Alternative,
    {
      start: expressions.at(0)?.start ?? 0,
      end: expressions.at(-1)?.end ?? 0,
    },
    {
      expressions,
    },
  );

export const createCharRangeNode = (from: CharNode, to: CharNode) =>
  createNode<CharRangeNode>(
    SyntaxKind.CharRange,
    {
      start: from.start,
      end: to.end,
    },
    {
      from: from,
      to: to,
    },
  );

export const createQuantifierNode = (position: NodePosition, value: InferNodeValue<QuantifierNode>) =>
  createNode<QuantifierNode>(SyntaxKind.Quantifier, position, value);

export const createRepetitionNode = (expression: AnyRegexpNode, quantifier: QuantifierNode) =>
  createNode<RepetitionNode>(
    SyntaxKind.Repetition,
    {
      start: expression.start,
      end: quantifier.end,
    },
    {
      quantifier,
      expression,
    },
  );

export const createBackReferenceNode = (position: NodePosition, group: GroupNode) =>
  createNode<BackReferenceNode>(SyntaxKind.BackReference, position, {
    group,
  });

export const createDisjunctionNode = (left: AnyRegexpNode[], right: AnyRegexpNode[], position: NodePosition) => {
  const normalizedPosition = {
    start: left.at(0)?.start ?? position.start,
    end: right.at(-1)?.end ?? position.end,
  };

  return createNode<DisjunctionNode>(SyntaxKind.Disjunction, normalizedPosition, {
    left: sealExpressions(left, normalizedPosition, normalizedPosition),
    right: sealExpressions(right, normalizedPosition, normalizedPosition),
  });
};

export const createCharClassNode = (negative: boolean, expressions: AnyRegexpNode[], position: NodePosition) =>
  createNode<CharClassNode>(SyntaxKind.CharClass, position, {
    negative,
    expressions,
  });

export const createGroupNameNode = (name: string, position: NodePosition) =>
  createNode<GroupNameNode>(SyntaxKind.GroupName, position, { name });

export const createGroupNode = (
  type: GroupNode['type'],
  specifier: GroupNode['specifier'],
  expressions: AnyRegexpNode[],
  position: NodePosition,
) => {
  const bodyPosition = {
    start: expressions.at(0)?.start ?? (specifier ? specifier.end + 1 : position.start + 1),
    end: expressions.at(-1)?.end ?? (specifier ? specifier.end : position.start),
  };

  return createNode<GroupNode>(SyntaxKind.Group, position, {
    type,
    specifier,
    body: sealExpressions(expressions, bodyPosition, bodyPosition),
  });
};

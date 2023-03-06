import type {
  AlternativeNode,
  AnyCharNode,
  AnyDigitNode,
  AnyRegexpNode,
  AnyWhitespaceNode,
  AnyWordNode,
  ASCIIControlCharNode,
  BackReferenceNode,
  BackspaceNode,
  CharClassNode,
  CharNode,
  CharRangeNode,
  ControlEscapeCharNode,
  ControlEscapeCharType,
  DisjunctionNode,
  GroupNameNode,
  GroupNode,
  InferNodeActualValue,
  InferNodeKind,
  InferNodeValue,
  LineEndNode,
  LineStartNode,
  Node,
  NodePosition,
  NonDigitNode,
  NonUnicodePropertyNode,
  NonWhitespaceNode,
  NonWordBoundaryNode,
  NonWordNode,
  NullCharNode,
  QuantifierNode,
  RegexpNode,
  RepetitionNode,
  SubpatternNode,
  UnicodePropertyNode,
  WordBoundaryNode,
} from './regexpNodes.js';
import { SyntaxKind } from './regexpNodes.js';

const simplePosition = (x: number): NodePosition => ({ start: x, end: x });

export const sealExpressions = (expressions: AnyRegexpNode[], fallbackPosition: NodePosition) => {
  const firstNode = expressions.at(0);

  if (firstNode && expressions.length === 1) {
    return firstNode;
  }

  return createAlternativeNode(expressions, fallbackPosition);
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

export const createRegexpNode = (expressions: AnyRegexpNode[], flags: string = ''): RegexpNode => {
  const body = sealExpressions(expressions, simplePosition(1));
  return createNode<RegexpNode>(
    SyntaxKind.Regexp,
    {
      start: body.start - 1,
      end: body.end + 1 + flags.length,
    },
    {
      flags,
      body,
    },
  );
};

export const createCharNode = (value: string, position: NodePosition, type: CharNode['type']) =>
  createNode<CharNode>(SyntaxKind.Char, position, {
    type,
    value,
    charCode: value.charCodeAt(0),
  });

export const createASCIIControlCharNode = (value: string, position: NodePosition) =>
  createNode<ASCIIControlCharNode>(SyntaxKind.ASCIIControlChar, position, {
    value,
  });

export const createAlternativeNode = (expressions: AnyRegexpNode[], fallbackPosition: NodePosition) => {
  const firstNode = expressions.at(0);

  if (firstNode && isAlternativeNode(firstNode) && expressions.length === 1) {
    return firstNode;
  }

  return createNode<AlternativeNode>(
    SyntaxKind.Alternative,
    {
      start: expressions.at(0)?.start ?? fallbackPosition.start,
      end: expressions.at(-1)?.end ?? fallbackPosition.end,
    },
    {
      expressions,
    },
  );
};

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

export const createDisjunctionNode = (
  left: AnyRegexpNode[],
  right: AnyRegexpNode[],
  separatorPosition: NodePosition,
) => {
  const normalizedPosition = {
    start: left.at(0)?.start ?? separatorPosition.start,
    end: right.at(-1)?.end ?? separatorPosition.end,
  };

  return createNode<DisjunctionNode>(SyntaxKind.Disjunction, normalizedPosition, {
    left: sealExpressions(left, separatorPosition),
    right: sealExpressions(right, separatorPosition),
  });
};

export const createCharClassNode = (negative: boolean, expressions: AnyRegexpNode[], position: NodePosition) =>
  createNode<CharClassNode>(SyntaxKind.CharClass, position, {
    negative,
    expressions,
  });

export const createGroupNameNode = (name: string, position: NodePosition) =>
  createNode<GroupNameNode>(SyntaxKind.GroupName, position, { name });

export const createControlEscapeNode = (type: ControlEscapeCharType, position: NodePosition) =>
  createNode<ControlEscapeCharNode>(SyntaxKind.ControlEscapeChar, position, { type });

export const createGroupNode = (
  type: GroupNode['type'],
  specifier: GroupNode['specifier'],
  expressions: AnyRegexpNode[],
  position: NodePosition,
) =>
  createNode<GroupNode>(SyntaxKind.Group, position, {
    type,
    specifier,
    body: sealExpressions(expressions, position),
  });

export const createUnicodePropertyNode = (name: string, value: string | null, position: NodePosition) =>
  createNode<UnicodePropertyNode>(SyntaxKind.UnicodeProperty, position, { name, value });

export const createNonUnicodePropertyNode = (name: string, value: string | null, position: NodePosition) =>
  createNode<NonUnicodePropertyNode>(SyntaxKind.NonUnicodeProperty, position, { name, value });

// checkers

const createChecker =
  <T extends Node<SyntaxKind, Record<string, unknown>>>(kind: T['kind']) =>
  (node: unknown): node is T =>
    typeof node === 'object' && !!node ? (node as Node).kind === kind : false;

export const isRegexpNode = createChecker<RegexpNode>(SyntaxKind.Regexp);
export const isLineStartNode = createChecker<LineStartNode>(SyntaxKind.LineStart);
export const isLineEndNode = createChecker<LineEndNode>(SyntaxKind.LineEnd);
export const isDisjunctionNode = createChecker<DisjunctionNode>(SyntaxKind.Disjunction);
export const isCharRangeNode = createChecker<CharRangeNode>(SyntaxKind.CharRange);
export const isAlternativeNode = createChecker<AlternativeNode>(SyntaxKind.Alternative);
export const isCharNode = createChecker<CharNode>(SyntaxKind.Char);
export const isASCIIControlCharNode = createChecker<ASCIIControlCharNode>(SyntaxKind.ASCIIControlChar);
export const isControlEscapeCharNode = createChecker<ControlEscapeCharNode>(SyntaxKind.ControlEscapeChar);
export const isNullCharNode = createChecker<NullCharNode>(SyntaxKind.NullChar);
export const isBackspaceNode = createChecker<BackspaceNode>(SyntaxKind.Backspace);
export const isSubpatternNode = createChecker<SubpatternNode>(SyntaxKind.Subpattern);
export const isAnyCharNode = createChecker<AnyCharNode>(SyntaxKind.AnyChar);
export const isAnyDigitNode = createChecker<AnyDigitNode>(SyntaxKind.AnyDigit);
export const isNonDigitNode = createChecker<NonDigitNode>(SyntaxKind.NonDigit);
export const isAnyWhitespaceNode = createChecker<AnyWhitespaceNode>(SyntaxKind.AnyWhitespace);
export const isNonWhitespaceNode = createChecker<NonWhitespaceNode>(SyntaxKind.NonWhitespace);
export const isAnyWordNode = createChecker<AnyWordNode>(SyntaxKind.AnyWord);
export const isNonWordNode = createChecker<NonWordNode>(SyntaxKind.NonWord);
export const isWordBoundaryNode = createChecker<WordBoundaryNode>(SyntaxKind.WordBoundary);
export const isNonWordBoundaryNode = createChecker<NonWordBoundaryNode>(SyntaxKind.NonWordBoundary);
export const isCharClassNode = createChecker<CharClassNode>(SyntaxKind.CharClass);
export const isGroupNode = createChecker<GroupNode>(SyntaxKind.Group);
export const isGroupNameNode = createChecker<GroupNameNode>(SyntaxKind.GroupName);
export const isBackReferenceNode = createChecker<BackReferenceNode>(SyntaxKind.BackReference);
export const isQuantifierNode = createChecker<QuantifierNode>(SyntaxKind.Quantifier);
export const isRepetitionNode = createChecker<RepetitionNode>(SyntaxKind.Repetition);
export const isUnicodePropertyNode = createChecker<UnicodePropertyNode>(SyntaxKind.UnicodeProperty);
export const isNonUnicodePropertyNode = createChecker<NonUnicodePropertyNode>(SyntaxKind.NonUnicodeProperty);

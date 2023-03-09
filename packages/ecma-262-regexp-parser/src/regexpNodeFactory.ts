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
  CharType,
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
import { isAlternativeNode } from './regexpNodeTypes.js';

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

const simpleNodeCreator =
  <T extends Node>(kind: InferNodeKind<T>) =>
  ({ start, end }: NodePosition): T =>
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

export const createCharNode = (value: string, type: CharType, position: NodePosition) =>
  createNode<CharNode>(SyntaxKind.Char, position, {
    type,
    value,
    charCode: value.charCodeAt(0),
  });

export const createAnyCharNode = simpleNodeCreator<AnyCharNode>(SyntaxKind.AnyChar);

export const createAnyDigitNode = simpleNodeCreator<AnyDigitNode>(SyntaxKind.AnyDigit);

export const createNonDigitNode = simpleNodeCreator<NonDigitNode>(SyntaxKind.NonDigit);

export const createAnyWhitespaceNode = simpleNodeCreator<AnyWhitespaceNode>(SyntaxKind.AnyWhitespace);

export const createNonWhitespaceNode = simpleNodeCreator<NonWhitespaceNode>(SyntaxKind.NonWhitespace);

export const createAnyWordNode = simpleNodeCreator<AnyWordNode>(SyntaxKind.AnyWord);

export const createNonWordNode = simpleNodeCreator<NonWordNode>(SyntaxKind.NonWord);

export const createWordBoundaryNode = simpleNodeCreator<WordBoundaryNode>(SyntaxKind.WordBoundary);

export const createNonWordBoundaryNode = simpleNodeCreator<NonWordBoundaryNode>(SyntaxKind.NonWordBoundary);

export const createBackspaceNode = simpleNodeCreator<BackspaceNode>(SyntaxKind.Backspace);

export const createLineEndNode = simpleNodeCreator<LineEndNode>(SyntaxKind.LineEnd);

export const createLineStartNode = simpleNodeCreator<LineStartNode>(SyntaxKind.LineStart);

export const createNullCharNode = simpleNodeCreator<NullCharNode>(SyntaxKind.NullChar);

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

export const createQuantifierNode = (value: InferNodeValue<QuantifierNode>, position: NodePosition) =>
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

export const createBackReferenceNode = (group: GroupNode, position: NodePosition) =>
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

export const createSubpatternNode = (groupName: string, ref: GroupNode | null, position: NodePosition) =>
  createNode<SubpatternNode>(SyntaxKind.Subpattern, position, {
    ref,
    groupName,
  });

export const createUnicodePropertyNode = (name: string, value: string | null, position: NodePosition) =>
  createNode<UnicodePropertyNode>(SyntaxKind.UnicodeProperty, position, { name, value });

export const createNonUnicodePropertyNode = (name: string, value: string | null, position: NodePosition) =>
  createNode<NonUnicodePropertyNode>(SyntaxKind.NonUnicodeProperty, position, { name, value });

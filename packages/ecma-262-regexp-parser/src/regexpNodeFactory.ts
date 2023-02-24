import type {
  Node,
  AlternativeNode,
  AnyRegexpNode,
  BackReferenceNode,
  CharClassNode,
  CharNode,
  CharRangeNode,
  ASCIIControlCharNode,
  DisjunctionNode,
  GroupNameNode,
  GroupNode,
  InferNodeActualValue,
  InferNodeKind,
  InferNodeValue,
  NodePosition,
  QuantifierNode,
  RepetitionNode,
  RegexpNode,
  ControlEscapeCharNode,
  ControlEscapeCharType,
} from './regexpNodes.js';
import { SyntaxKind } from './regexpNodes.js';
// FIXME circular dep
import { sealExpressions } from './regexpParseUtils.js';

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
  const body = sealExpressions(expressions);
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

export const createControlEscapeNode = (type: ControlEscapeCharType, position: NodePosition) =>
  createNode<ControlEscapeCharNode>(SyntaxKind.ControlEscapeChar, position, { type });

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

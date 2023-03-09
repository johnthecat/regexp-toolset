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
  DisjunctionNode,
  GroupNameNode,
  GroupNode,
  LineEndNode,
  LineStartNode,
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

type Nodes = {
  [SyntaxKind.Regexp]: RegexpNode;
  [SyntaxKind.LineStart]: LineStartNode;
  [SyntaxKind.LineEnd]: LineEndNode;
  [SyntaxKind.Disjunction]: DisjunctionNode;
  [SyntaxKind.CharRange]: CharRangeNode;
  [SyntaxKind.Alternative]: AlternativeNode;
  [SyntaxKind.Char]: CharNode;
  [SyntaxKind.ASCIIControlChar]: ASCIIControlCharNode;
  [SyntaxKind.ControlEscapeChar]: ControlEscapeCharNode;
  [SyntaxKind.NullChar]: NullCharNode;
  [SyntaxKind.Backspace]: BackspaceNode;
  [SyntaxKind.Subpattern]: SubpatternNode;
  [SyntaxKind.AnyChar]: AnyCharNode;
  [SyntaxKind.AnyDigit]: AnyDigitNode;
  [SyntaxKind.NonDigit]: NonDigitNode;
  [SyntaxKind.AnyWhitespace]: AnyWhitespaceNode;
  [SyntaxKind.NonWhitespace]: NonWhitespaceNode;
  [SyntaxKind.AnyWord]: AnyWordNode;
  [SyntaxKind.NonWord]: NonWordNode;
  [SyntaxKind.WordBoundary]: WordBoundaryNode;
  [SyntaxKind.NonWordBoundary]: NonWordBoundaryNode;
  [SyntaxKind.CharClass]: CharClassNode;
  [SyntaxKind.Group]: GroupNode;
  [SyntaxKind.GroupName]: GroupNameNode;
  [SyntaxKind.BackReference]: BackReferenceNode;
  [SyntaxKind.Quantifier]: QuantifierNode;
  [SyntaxKind.Repetition]: RepetitionNode;
  [SyntaxKind.UnicodeProperty]: UnicodePropertyNode;
  [SyntaxKind.NonUnicodeProperty]: NonUnicodePropertyNode;
};

type FullVisitor<T extends SyntaxKind> = {
  enter: (node: Readonly<Nodes[T]>) => void;
  exit: (node: Readonly<Nodes[T]>) => void;
};

type Visitor<T extends SyntaxKind> = Partial<FullVisitor<T>> | FullVisitor<T>['enter'];

type Visitors = { '*': Visitor<SyntaxKind> } & {
  [K in SyntaxKind]: Visitor<K>;
};

const applyEnterVisitor = <T extends SyntaxKind>(node: Nodes[T], visitors: Partial<Visitors>) => {
  const specificKindVisitor = visitors[node.kind] as Visitor<T> | void;
  const genericVisitor = visitors['*'];
  if (specificKindVisitor) {
    typeof specificKindVisitor === 'function' ? specificKindVisitor(node) : specificKindVisitor.enter?.(node);
  }
  if (genericVisitor) {
    typeof genericVisitor === 'function' ? genericVisitor(node) : genericVisitor.enter?.(node);
  }
};

const applyExitVisitor = <T extends SyntaxKind>(node: Nodes[T], visitors: Partial<Visitors>) => {
  const specificKindVisitor = visitors[node.kind] as Visitor<T> | void;
  const genericVisitor = visitors['*'];
  if (typeof specificKindVisitor === 'object') {
    specificKindVisitor.exit?.(node);
  }
  if (typeof genericVisitor === 'object') {
    genericVisitor.exit?.(node);
  }
};

export const traverseRegexpNode = (node: AnyRegexpNode, visitors: Partial<Visitors>): void => {
  applyEnterVisitor(node, visitors);
  switch (node.kind) {
    case SyntaxKind.Regexp:
    case SyntaxKind.Group:
      traverseRegexpNode(node.body, visitors);
      break;
    case SyntaxKind.Disjunction:
      traverseRegexpNode(node.left, visitors);
      traverseRegexpNode(node.right, visitors);
      break;
    case SyntaxKind.CharRange:
      traverseRegexpNode(node.from, visitors);
      traverseRegexpNode(node.to, visitors);
      break;
    case SyntaxKind.Repetition:
      traverseRegexpNode(node.expression, visitors);
      traverseRegexpNode(node.quantifier, visitors);
      break;
    case SyntaxKind.BackReference:
      traverseRegexpNode(node.group, visitors);
      break;
    case SyntaxKind.Alternative:
    case SyntaxKind.CharClass:
      for (const x of node.expressions) {
        traverseRegexpNode(x, visitors);
      }
      break;
    default:
      break;
  }
  applyExitVisitor(node, visitors);
};

import type {
  AlternativeNode,
  AnyCharNode,
  AnyDigitNode,
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
  Node,
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
import { isObject } from './common/typeCheckers.js';

const createTypeChecker =
  <T extends Node<SyntaxKind, Record<string, unknown>>>(kind: T['kind']) =>
  (node: unknown): node is T =>
    isObject(node) ? (node as Node).kind === kind : false;

export const isRegexpNode = createTypeChecker<RegexpNode>(SyntaxKind.Regexp);
export const isLineStartNode = createTypeChecker<LineStartNode>(SyntaxKind.LineStart);
export const isLineEndNode = createTypeChecker<LineEndNode>(SyntaxKind.LineEnd);
export const isDisjunctionNode = createTypeChecker<DisjunctionNode>(SyntaxKind.Disjunction);
export const isCharRangeNode = createTypeChecker<CharRangeNode>(SyntaxKind.CharRange);
export const isAlternativeNode = createTypeChecker<AlternativeNode>(SyntaxKind.Alternative);
export const isCharNode = createTypeChecker<CharNode>(SyntaxKind.Char);
export const isASCIIControlCharNode = createTypeChecker<ASCIIControlCharNode>(SyntaxKind.ASCIIControlChar);
export const isControlEscapeCharNode = createTypeChecker<ControlEscapeCharNode>(SyntaxKind.ControlEscapeChar);
export const isNullCharNode = createTypeChecker<NullCharNode>(SyntaxKind.NullChar);
export const isBackspaceNode = createTypeChecker<BackspaceNode>(SyntaxKind.Backspace);
export const isSubpatternNode = createTypeChecker<SubpatternNode>(SyntaxKind.Subpattern);
export const isAnyCharNode = createTypeChecker<AnyCharNode>(SyntaxKind.AnyChar);
export const isAnyDigitNode = createTypeChecker<AnyDigitNode>(SyntaxKind.AnyDigit);
export const isNonDigitNode = createTypeChecker<NonDigitNode>(SyntaxKind.NonDigit);
export const isAnyWhitespaceNode = createTypeChecker<AnyWhitespaceNode>(SyntaxKind.AnyWhitespace);
export const isNonWhitespaceNode = createTypeChecker<NonWhitespaceNode>(SyntaxKind.NonWhitespace);
export const isAnyWordNode = createTypeChecker<AnyWordNode>(SyntaxKind.AnyWord);
export const isNonWordNode = createTypeChecker<NonWordNode>(SyntaxKind.NonWord);
export const isWordBoundaryNode = createTypeChecker<WordBoundaryNode>(SyntaxKind.WordBoundary);
export const isNonWordBoundaryNode = createTypeChecker<NonWordBoundaryNode>(SyntaxKind.NonWordBoundary);
export const isCharClassNode = createTypeChecker<CharClassNode>(SyntaxKind.CharClass);
export const isGroupNode = createTypeChecker<GroupNode>(SyntaxKind.Group);
export const isGroupNameNode = createTypeChecker<GroupNameNode>(SyntaxKind.GroupName);
export const isBackReferenceNode = createTypeChecker<BackReferenceNode>(SyntaxKind.BackReference);
export const isQuantifierNode = createTypeChecker<QuantifierNode>(SyntaxKind.Quantifier);
export const isRepetitionNode = createTypeChecker<RepetitionNode>(SyntaxKind.Repetition);
export const isUnicodePropertyNode = createTypeChecker<UnicodePropertyNode>(SyntaxKind.UnicodeProperty);
export const isNonUnicodePropertyNode = createTypeChecker<NonUnicodePropertyNode>(SyntaxKind.NonUnicodeProperty);

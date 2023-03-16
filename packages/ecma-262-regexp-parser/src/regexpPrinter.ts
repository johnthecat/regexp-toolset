import type { RegexpNode } from './regexpNodes.js';
import { type AnyRegexpNode, CharType, ControlEscapeCharType, QuantifierType, SyntaxKind } from './regexpNodes.js';
import { isVoid } from './common/typeCheckers.js';

// eslint-disable-next-line complexity
export const printRegexpNode = (node: AnyRegexpNode): string => {
  switch (node.kind) {
    case SyntaxKind.Regexp:
      return `/${printRegexpNode(node.body)}/${node.flags}`;
    case SyntaxKind.Disjunction:
      return `${printRegexpNode(node.left)}|${printRegexpNode(node.right)}`;
    case SyntaxKind.Alternative:
      return node.expressions.map(printRegexpNode).join('');
    case SyntaxKind.Group: {
      let heading: string = '';
      switch (node.type) {
        case 'capturing':
          if (node.specifier) {
            heading = `?<${node.specifier.name}>`;
          }
          break;
        case 'nonCapturing':
          heading = '?:';
          break;
        case 'positiveLookahead':
          heading = '?=';
          break;
        case 'negativeLookahead':
          heading = '?!';
          break;
        case 'positiveLookbehind':
          heading = '?<=';
          break;
        case 'negativeLookbehind':
          heading = '?<!';
          break;
      }
      return `(${heading}${printRegexpNode(node.body)})`;
    }
    case SyntaxKind.Repetition:
      return `${printRegexpNode(node.expression)}${printRegexpNode(node.quantifier)}`;
    case SyntaxKind.BackReference:
      return `${printRegexpNode(node.group)}\\1`;
    case SyntaxKind.CharClass:
      return `[${node.negative ? '^' : ''}${node.expressions.map(printRegexpNode).join('')}]`;
    case SyntaxKind.Char:
      switch (node.type) {
        case CharType.Simple:
          return node.value;
        case CharType.Hex:
          return `\\x${node.value.charCodeAt(0).toString(16).padStart(2, '0')}`;
        case CharType.Unicode:
          return `\\u${node.value.charCodeAt(0).toString(16).padStart(4, '0')}`;
        case CharType.Escaped:
          return `\\${node.value}`;
        case CharType.Octal:
          return `\\${node.value.charCodeAt(0).toString(8).padStart(3, '0')}`;
        default:
          throw new Error('Unsupported');
      }
    case SyntaxKind.ControlEscapeChar:
      switch (node.type) {
        case ControlEscapeCharType.NewLine:
          return '\\n';
        case ControlEscapeCharType.Tab:
          return '\\t';
        case ControlEscapeCharType.FormFeedChar:
          return '\\f';
        case ControlEscapeCharType.CarriageReturn:
          return '\\r';
        case ControlEscapeCharType.VerticalWhitespace:
          return '\\v';
        default:
          throw new Error('Unsupported');
      }
    case SyntaxKind.CharRange:
      return `${printRegexpNode(node.from)}-${printRegexpNode(node.to)}`;
    case SyntaxKind.Subpattern:
      return `\\k<${node.groupName}>`;
    case SyntaxKind.UnicodeProperty:
      return `\\p{${node.name}${node.value ? `=${node.value}` : ''}`;
    case SyntaxKind.NonUnicodeProperty:
      return `\\P{${node.name}${node.value ? `=${node.value}` : ''}`;
    case SyntaxKind.LineStart:
      return '^';
    case SyntaxKind.LineEnd:
      return '$';
    case SyntaxKind.AnyChar:
      return '.';
    case SyntaxKind.ASCIIControlChar:
      return `\\c${node.value}`;
    case SyntaxKind.NullChar:
      return '\\0';
    case SyntaxKind.Backspace:
      return '\\b';
    case SyntaxKind.AnyDigit:
      return '\\d';
    case SyntaxKind.NonDigit:
      return '\\D';
    case SyntaxKind.AnyWhitespace:
      return '\\s';
    case SyntaxKind.NonWhitespace:
      return '\\S';
    case SyntaxKind.AnyWord:
      return '\\w';
    case SyntaxKind.NonWord:
      return '\\W';
    case SyntaxKind.WordBoundary:
      return '\\b';
    case SyntaxKind.NonWordBoundary:
      return '\\b';
    case SyntaxKind.GroupName:
      return node.name;
    case SyntaxKind.Quantifier: {
      let quantifier: string = '';
      switch (node.type) {
        case QuantifierType.SingleOrMany:
          quantifier = '+';
          break;
        case QuantifierType.NoneOrSingle:
          quantifier = '?';
          break;
        case QuantifierType.NoneOrMany:
          quantifier = '*';
          break;
        case QuantifierType.Range:
          if (isVoid(node.to)) {
            quantifier = `{${node.from}}`;
          } else {
            quantifier = `{${node.from},${node.to === Number.POSITIVE_INFINITY ? '' : node.to}}`;
          }
          break;
      }
      if (!node.greedy) {
        quantifier += '?';
      }
      return quantifier;
    }
  }
};

export const createRegExpFromRegexpNode = (node: RegexpNode): RegExp => {
  return new RegExp(printRegexpNode(node.body), node.flags);
};

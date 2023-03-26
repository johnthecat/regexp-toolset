import { type AnyRegexpNode, ControlEscapeCharType, QuantifierType, SyntaxKind } from 'ecma-262-regexp-parser';
import type { ExplainRenderer } from './renderer.js';

export type ExplainerContext<T> = {
  source: string;
  renderer: ExplainRenderer<T>;
};

type GenericTitle = {
  header: string;
  description?: string;
};

const pluralCount = (i: number): string => {
  const j = i % 10;
  const k = i % 100;
  if (j === 1 && k !== 11) {
    return i.toString() + 'st';
  }
  if (j === 2 && k !== 12) {
    return i.toString() + 'nd';
  }
  if (j === 3 && k !== 13) {
    return i.toString() + 'rd';
  }
  return i.toString() + 'th';
};

const controlEscapeCharTitle = {
  [ControlEscapeCharType.FormFeedChar]: 'Form Feed Char',
  [ControlEscapeCharType.NewLine]: 'New Line',
  [ControlEscapeCharType.VerticalWhitespace]: 'Vertical Whitespace',
  [ControlEscapeCharType.CarriageReturn]: 'Carriage Return',
  [ControlEscapeCharType.Tab]: 'Tab',
};

const genericNodeTitle: Record<SyntaxKind, GenericTitle> = {
  [SyntaxKind.Regexp]: { header: 'Regular Expression' },
  [SyntaxKind.Disjunction]: { header: 'Disjunction' },
  [SyntaxKind.CharRange]: { header: 'Character Range' },
  [SyntaxKind.Alternative]: { header: 'Alternative' },
  [SyntaxKind.Char]: { header: 'Character' },
  [SyntaxKind.Group]: { header: 'Group' },
  [SyntaxKind.Repetition]: { header: 'Repetition' },
  [SyntaxKind.ControlEscapeChar]: { header: 'Control Escape Character' },
  [SyntaxKind.GroupName]: { header: 'Group name' },
  [SyntaxKind.NullChar]: { header: 'Null Character' },
  [SyntaxKind.AnyWhitespace]: { header: 'Any Whitespace' },
  [SyntaxKind.NonWhitespace]: { header: 'Non Whitespace' },
  [SyntaxKind.ASCIIControlChar]: { header: 'ASCII Control Character' },
  [SyntaxKind.AnyChar]: { header: 'Any' },
  [SyntaxKind.LineStart]: { header: 'Line Start' },
  [SyntaxKind.LineEnd]: { header: 'Line End' },
  [SyntaxKind.AnyWord]: { header: 'Any Word', description: 'matches [A-Za-z0-9_]' },
  [SyntaxKind.NonWord]: { header: 'Non Word', description: 'matches [^A-Za-z0-9_]' },
  [SyntaxKind.AnyDigit]: { header: 'Any Digit', description: 'matches [0-9]' },
  [SyntaxKind.NonDigit]: { header: 'Non Digit', description: 'matches [^0-9]' },
  [SyntaxKind.Backspace]: { header: 'Backspace' },
  [SyntaxKind.Quantifier]: { header: 'Quantifier' },
  [SyntaxKind.WordBoundary]: { header: 'Word Boundary' },
  [SyntaxKind.NonWordBoundary]: { header: 'Non Word Boundary' },
  [SyntaxKind.BackReference]: { header: 'Back Reference' },
  [SyntaxKind.CharClass]: { header: 'Character Class' },
  [SyntaxKind.UnicodeProperty]: { header: 'Unicode Property' },
  [SyntaxKind.NonUnicodeProperty]: { header: 'Non Unicode Property' },
  [SyntaxKind.Subpattern]: { header: 'Group Reference' },
};

// eslint-disable-next-line complexity
export const explainNode = <T>(node: AnyRegexpNode, parentNode: AnyRegexpNode, ctx: ExplainerContext<T>): T => {
  const { renderer } = ctx;
  renderer.beforeNodeExplain(parentNode, node);
  switch (node.kind) {
    case SyntaxKind.Regexp:
      return renderer.renderNodeExplain(
        genericNodeTitle[node.kind].header,
        parentNode,
        node,
        explainNode(node.body, node, ctx),
      );

    case SyntaxKind.Disjunction:
      return renderer.renderNodeExplain(genericNodeTitle[node.kind].header, parentNode, node, [
        explainNode(node.left, node, ctx),
        explainNode(node.right, node, ctx),
      ]);

    case SyntaxKind.Alternative:
      return renderer.renderNodeExplain(
        'Alternative',
        parentNode,
        node,
        node.expressions.map(x => explainNode(x, node, ctx)),
      );

    case SyntaxKind.Group: {
      let headerText: string = '';
      switch (node.type) {
        case 'capturing':
          if (node.specifier) {
            headerText = `Named Capturing Group: '${node.specifier.name}'`;
          } else {
            headerText = `${pluralCount(node.index)} Capturing Group`;
          }
          break;
        case 'nonCapturing':
          headerText = 'Non Capturing Group';
          break;
        case 'positiveLookahead':
          headerText = 'Positive Lookahead';
          break;
        case 'negativeLookahead':
          headerText = 'Negative Lookahead';
          break;
        case 'positiveLookbehind':
          headerText = 'Positive Lookbehind';
          break;
        case 'negativeLookbehind':
          headerText = 'Negative Lookbehind';
          break;
      }
      const child = explainNode(node.body, node, ctx);
      // if (shouldWrapInBlock(node.body)) {
      //   child = renderBlock(ctx, child);
      // }
      return renderer.renderNodeExplain(headerText, parentNode, node, child);
    }

    case SyntaxKind.Repetition: {
      let repetition: string = '';

      switch (node.quantifier.type) {
        case QuantifierType.SingleOrMany:
          repetition = 'between one and unlimited times';
          break;
        case QuantifierType.NoneOrSingle:
          repetition = 'between zero and one times';
          break;
        case QuantifierType.NoneOrMany:
          repetition = 'between zero and unlimited times';
          break;
        case QuantifierType.Range:
          if (typeof node.quantifier.to === 'undefined') {
            repetition = `${node.quantifier.from} time${node.quantifier.from === 1 ? '' : 's'}`;
          } else {
            repetition = `between ${node.quantifier.from} to ${
              node.quantifier.to === Number.MAX_SAFE_INTEGER ? 'infinite' : node.quantifier.to
            } time${node.quantifier.to === 1 ? '' : 's'}`;
          }
          break;
      }

      if (!node.quantifier.greedy) {
        repetition += ' (lazy)';
      }

      const childNode = explainNode(node.expression, parentNode, ctx);
      return renderer.renderNodeExplain(repetition, parentNode, node, childNode);
    }

    case SyntaxKind.BackReference: {
      const child = explainNode(node.group, node, ctx);
      return renderer.renderNodeExplain(genericNodeTitle[node.kind].header, parentNode, node, child);
    }

    case SyntaxKind.CharClass: {
      const result = node.expressions.map(x => explainNode(x, node, ctx));
      return renderer.renderNodeExplain(
        (node.negative ? 'Negative ' : '') + genericNodeTitle[node.kind].header,
        parentNode,
        node,
        result,
      );
    }

    case SyntaxKind.ControlEscapeChar: {
      return renderer.renderNodeExplain(controlEscapeCharTitle[node.type], parentNode, node, null);
    }

    case SyntaxKind.Subpattern:
      return renderer.renderNodeExplain(
        `${genericNodeTitle[node.kind].header}: '${node.groupName}'`,
        parentNode,
        node,
        null,
      );

    case SyntaxKind.UnicodeProperty:
    case SyntaxKind.NonUnicodeProperty: {
      const name = node.value ? `${node.value} in ${node.name}` : node.name;
      return renderer.renderNodeExplain(`${genericNodeTitle[node.kind].header}: ${name}`, parentNode, node, null);
    }

    default:
      return renderer.renderNodeExplain(genericNodeTitle[node.kind].header, parentNode, node, null);
  }
};

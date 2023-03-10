import type { AnyRegexpNode } from 'ecma-262-regexp-parser';
import {
  CharType,
  ControlEscapeCharType,
  parseRegexp,
  parseRegexpNode,
  QuantifierType,
  SyntaxKind,
  types,
} from 'ecma-262-regexp-parser';
import {
  addIndent,
  bold,
  colorStringPart,
  create256ColorsBgFormatter,
  create256ColorsFormatter,
  create256ColorsTextFormatter,
  dim,
  type Formatter,
  inverse,
  italic,
  pluralCount,
  resetEnd,
} from './console.js';
import { Graph } from './graph.js';

type Colors = [Formatter, ...Formatter[]] | Formatter;

type ExplainerContext = {
  enableColors: boolean;
  source: string;
  capturingGroups: number;
  nodesGraph: Graph<AnyRegexpNode>;
  assignedColors: Map<AnyRegexpNode, Formatter>;
  colorMap: Record<
    | 'dim'
    | 'inverse'
    | 'header'
    | 'secondaryHeader'
    | 'secondary'
    | 'border'
    | 'group'
    | 'groupName'
    | 'charClass'
    | 'expression'
    | 'whitespace'
    | 'char',
    Colors
  >;
};

type GenericTitle = {
  header: string;
  description?: string;
  color?: keyof ExplainerContext['colorMap'];
};

const renderingPrimitives = {
  blockStart: '╭',
  blockSpanStart: '┌',
  simpleBlockEnd: '╰',
  simpleBlockSpanEnd: '┕',
  largeBlockEnd: '╰ ·',
  largeBlockSpanEnd: '┕ ·',
  singleBlockNode: '·',
  blockVerticalConnector: '│',
  horizontalSeparator: '╌'.repeat(20),
  referenceArrow: '«',
  ellipsis: '...',
  whitespace: '•',
} as const;

const id = <T>(x: T): T => x;

const flagDescriptions = {
  g: `Performs a global match, finding all matches rather than just the first.`,
  i: `Makes matches case-insensitive. Matches both uppercase and lowercase.`,
  m: `Performs multiline matches. (Changes behavior of ^,$)`,
  s: `Allows . to match newline characters.`,
  u: `Enables Unicode support.`,
  y: `Matches are sticky, looking only at exact position in the text.`,
};

const emptyColorMap: ExplainerContext['colorMap'] = {
  dim: id,
  inverse: id,
  secondary: id,
  border: id,
  expression: id,
  group: id,
  charClass: id,
  groupName: id,
  whitespace: id,
  char: id,
  secondaryHeader: id,
  header: id,
};

const colorMapFor256Colors: ExplainerContext['colorMap'] = {
  dim: dim,
  inverse: inverse,
  secondary: italic,
  header: x => bold(` ❱ ${x} `),
  secondaryHeader: bold,
  border: create256ColorsTextFormatter(247),
  charClass: create256ColorsFormatter(223, 0),
  groupName: create256ColorsFormatter(127, 255),
  expression: create256ColorsFormatter(32, 255),
  whitespace: create256ColorsFormatter(255, 8),
  char: create256ColorsFormatter(255, 0),
  group: [
    create256ColorsBgFormatter(148),
    create256ColorsBgFormatter(113),
    create256ColorsFormatter(30, 255),
    create256ColorsFormatter(31, 255),
  ],
};

const controlEscapeCharTitle = {
  [ControlEscapeCharType.FormFeedChar]: 'Form Feed Char',
  [ControlEscapeCharType.NewLine]: 'New Line',
  [ControlEscapeCharType.VerticalWhitespace]: 'Vertical Whitespace',
  [ControlEscapeCharType.CarriageReturn]: 'Carriage Return',
  [ControlEscapeCharType.Tab]: 'Tab',
};

const genericNodeTitle: Record<string, GenericTitle> = {
  [SyntaxKind.GroupName]: { header: 'Group name', color: 'expression' },
  [SyntaxKind.NullChar]: { header: 'Null Character', color: 'expression' },
  [SyntaxKind.AnyWhitespace]: { header: 'Any Whitespace', color: 'expression' },
  [SyntaxKind.NonWhitespace]: { header: 'Non Whitespace', color: 'expression' },
  [SyntaxKind.ASCIIControlChar]: { header: 'ASCII Control', color: 'expression' },
  [SyntaxKind.AnyChar]: { header: 'Any', color: 'expression' },
  [SyntaxKind.LineStart]: { header: 'Line Start', color: 'expression' },
  [SyntaxKind.LineEnd]: { header: 'Line End', color: 'expression' },
  [SyntaxKind.AnyWord]: { header: 'Any Word', description: 'matches [A-Za-z0-9_]', color: 'expression' },
  [SyntaxKind.NonWord]: { header: 'Non Word', description: 'matches [^A-Za-z0-9_]', color: 'expression' },
  [SyntaxKind.AnyDigit]: { header: 'Any Digit', description: 'matches [0-9]', color: 'expression' },
  [SyntaxKind.NonDigit]: { header: 'Non Digit', description: 'matches [^0-9]', color: 'expression' },
  [SyntaxKind.Backspace]: { header: 'Backspace', color: 'expression' },
  [SyntaxKind.Quantifier]: { header: 'Quantifier', color: 'expression' },
  [SyntaxKind.WordBoundary]: { header: 'Word Boundary', color: 'expression' },
  [SyntaxKind.NonWordBoundary]: { header: 'Non Word Boundary', color: 'expression' },
};

const paint = (content: string, color: Colors, index = 0) => {
  let formatter: Formatter;
  if (Array.isArray(color)) {
    const pickedColor = color[Math.min(color.length - 1, index)];
    if (!pickedColor) {
      throw new Error('Colors has gaps in array');
    }
    formatter = pickedColor;
  } else {
    formatter = color;
  }

  return formatter(content);
};

const renderBlock = (ctx: ExplainerContext, content: string, index = 0, of = 1): string => {
  const borderColor: Formatter = x => paint(x, ctx.colorMap.border);
  const isFirst = index === 0;
  const isLast = index === of - 1;

  if (content.includes('\n')) {
    const parts = content
      .split('\n')
      .map(
        (x, i) =>
          `${borderColor(
            i === 0
              ? isFirst
                ? renderingPrimitives.blockStart
                : renderingPrimitives.blockSpanStart
              : renderingPrimitives.blockVerticalConnector,
          )} ${x}`,
      );
    parts.push(borderColor(isLast ? renderingPrimitives.largeBlockEnd : renderingPrimitives.largeBlockSpanEnd));
    return parts.join('\n');
  }

  if (isFirst && isLast) {
    return `${borderColor(renderingPrimitives.singleBlockNode)} ${content}`;
  }

  if (isFirst) {
    return `${borderColor(renderingPrimitives.blockStart)} ${content}`;
  }

  if (isLast) {
    return `${borderColor(renderingPrimitives.simpleBlockEnd)} ${content}`;
  }

  return `${borderColor(renderingPrimitives.singleBlockNode)} ${content}`;
};

const printNode = (source: string, node: AnyRegexpNode): string => {
  const maxLength = 70;
  if (node.end - node.start > maxLength) {
    return (
      source.slice(node.start, node.start + maxLength - renderingPrimitives.ellipsis.length) +
      renderingPrimitives.ellipsis
    );
  } else {
    return source.slice(node.start, node.end + 1);
  }
};

const assignColor = (
  node: AnyRegexpNode,
  parentNode: AnyRegexpNode,
  ctx: ExplainerContext,
  colors: Colors,
): Formatter => {
  if (!ctx.enableColors) {
    return id;
  }

  const graphNode = ctx.nodesGraph.addChild(parentNode, node);
  let color: Formatter;
  if (Array.isArray(colors)) {
    const pickedColor = colors[Math.min(colors.length - 1, graphNode.level - 1)];
    if (!pickedColor) {
      throw new Error('Colors has gaps in array');
    }
    color = pickedColor;
  } else {
    color = colors;
  }
  ctx.assignedColors.set(node, color);
  return color;
};

const createExplainerContext = (source: string, entryNode: AnyRegexpNode, enableColors: boolean): ExplainerContext => ({
  source: source.replace(/\s/gm, renderingPrimitives.whitespace),
  nodesGraph: new Graph(entryNode),
  assignedColors: new Map(),
  capturingGroups: 0,
  enableColors,
  colorMap: enableColors ? colorMapFor256Colors : emptyColorMap,
});

const paintSource = (node: AnyRegexpNode, ctx: ExplainerContext): string => {
  const renderQueue: AnyRegexpNode[] = [];
  let coloredRegexp = ctx.source;

  if (ctx.source.length <= 400 && ctx.assignedColors.size <= 150) {
    ctx.nodesGraph.bfs(node, currentNode => renderQueue.push(currentNode));
    renderQueue.reverse();
    for (const currentNode of renderQueue) {
      const color = ctx.assignedColors.get(currentNode);
      if (!color) {
        continue;
      }
      coloredRegexp = colorStringPart(coloredRegexp, currentNode.start, currentNode.end, color);
    }
  }

  return coloredRegexp;
};

const shouldWrapInBlock = (node: AnyRegexpNode) =>
  !types.isDisjunctionNode(node) &&
  !(types.isAlternativeNode(node) && node.expressions.length) &&
  !types.isCharClassNode(node);

export const explainRegexp = (source: string, config: { enableColors: boolean }): string => {
  const regexp = parseRegexp(source);
  const ctx = createExplainerContext(source, regexp, config.enableColors);
  const result = explainNode(regexp, regexp, ctx);
  return addIndent(
    [paintSource(regexp, ctx), paint(renderingPrimitives.horizontalSeparator, ctx.colorMap.border), result].join('\n'),
  );
};

export const explainRegexpPart = (source: string, config: { enableColors: boolean }): string => {
  const regexp = parseRegexpNode(source);
  const ctx = createExplainerContext(source, regexp, config.enableColors);
  const result = explainNode(regexp, regexp, ctx);
  return addIndent(
    [paintSource(regexp, ctx), paint(renderingPrimitives.horizontalSeparator, ctx.colorMap.border), result].join('\n'),
  );
};

// eslint-disable-next-line complexity
export const explainNode = (node: AnyRegexpNode, parentNode: AnyRegexpNode, ctx: ExplainerContext): string => {
  const { source, colorMap } = ctx;
  const rawPrinted = printNode(source, node);
  const printed = paint(rawPrinted, colorMap.dim);
  const result: string[] = [];

  switch (node.kind) {
    case SyntaxKind.Regexp: {
      const childNodes = explainNode(node.body, node, ctx);
      const mainBlock = [childNodes];

      if (node.flags) {
        mainBlock.unshift(
          paint('Flags', colorMap.secondaryHeader),
          addIndent(
            node.flags
              .split('')
              .map(
                x =>
                  `${paint(x, colorMap.secondaryHeader)} - ${paint(
                    x in flagDescriptions ? flagDescriptions[x as keyof typeof flagDescriptions] : 'Unknown.',
                    colorMap.secondary,
                  )}`,
              )
              .join('\n'),
          ),
          paint(renderingPrimitives.horizontalSeparator, colorMap.border),
        );
      }

      result.push(...mainBlock);
      break;
    }

    case SyntaxKind.Disjunction: {
      const shouldRenderNode = (node: AnyRegexpNode) =>
        !(types.isAlternativeNode(node) && node.expressions.length === 0);

      const color = assignColor(node, parentNode, ctx, colorMap.expression);

      if (!types.isDisjunctionNode(parentNode)) {
        let deepestLeftNode: AnyRegexpNode = node.left;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (types.isDisjunctionNode(deepestLeftNode)) {
            deepestLeftNode = deepestLeftNode.left;
            continue;
          }

          break;
        }

        result.push(color(paint('Disjunction', colorMap.header)));
        result.push(
          `${paint('maybe', colorMap.secondary)} ${
            shouldRenderNode(deepestLeftNode) ? paint(printNode(source, deepestLeftNode), colorMap.dim) : ''
          }`,
        );
      }
      let left = explainNode(node.left, node, ctx);
      let right = explainNode(node.right, node, ctx);
      if (shouldWrapInBlock(node.left)) {
        left = renderBlock(ctx, left);
      }
      if (shouldWrapInBlock(node.right)) {
        right = renderBlock(ctx, right);
      }

      result.push(
        left,
        `${paint('or', colorMap.secondary)} ${
          shouldRenderNode(node.right) ? paint(printNode(source, node.right), colorMap.dim) : ''
        }`,
        right,
      );
      break;
    }

    case SyntaxKind.Alternative: {
      if (node.expressions.length === 0) {
        result.push(paint(paint('Zero Length', colorMap.header), colorMap.inverse));
        break;
      }

      for (const [index, expression] of node.expressions.entries()) {
        const printed = explainNode(expression, parentNode, ctx);
        result.push(renderBlock(ctx, printed, index, node.expressions.length));
      }
      break;
    }

    case SyntaxKind.Group: {
      const groupColor = assignColor(node, parentNode, ctx, colorMap.group);
      let headerText: string = '';
      switch (node.type) {
        case 'capturing':
          ctx.capturingGroups++;
          if (node.specifier) {
            headerText = `Named Capturing Group: '${node.specifier.name}'`;
          } else {
            headerText = `${pluralCount(ctx.capturingGroups)} Capturing Group`;
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
      let child = explainNode(node.body, node, ctx);
      if (shouldWrapInBlock(node.body)) {
        child = renderBlock(ctx, child);
      }
      result.push(`${groupColor(paint(headerText, colorMap.header))} ${printed}`, child);
      break;
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
              node.quantifier.to === Number.POSITIVE_INFINITY ? 'infinite' : node.quantifier.to
            } time${node.quantifier.to === 1 ? '' : 's'}`;
          }
          break;
      }

      if (!node.quantifier.greedy) {
        repetition += ' (lazy)';
      }

      const childNode = explainNode(node.expression, parentNode, ctx);
      assignColor(node.quantifier, parentNode, ctx, colorMap.expression);

      const partials = childNode.split('\n');
      const transformedResult = [
        `${partials.shift() ?? ''} ${renderingPrimitives.referenceArrow} ${paint(
          paint(repetition, colorMap.secondaryHeader),
          colorMap.secondary,
        )}`,
        ...partials,
      ].join('\n');

      result.push(transformedResult);
      break;
    }

    case SyntaxKind.BackReference: {
      assignColor(node, parentNode, ctx, colorMap.expression);
      const childNode = explainNode(node.group, node, ctx);

      const partials = childNode.split('\n');
      const transformedResult = [
        `${partials.shift() ?? ''} ${renderingPrimitives.referenceArrow} ${paint(
          paint('back reference', colorMap.secondaryHeader),
          colorMap.secondary,
        )}`,
        ...partials,
      ].join('\n');

      result.push(transformedResult);
      break;
    }

    case SyntaxKind.CharClass: {
      const color = assignColor(node, parentNode, ctx, colorMap.charClass);
      const postfix = node.expressions.length > 1 ? paint('or ', colorMap.dim) : '';

      result.push(
        `${color(paint((node.negative ? 'Negative ' : '') + 'Character Class', colorMap.header))} ${printed}`,
      );

      for (const [index, expression] of node.expressions.entries()) {
        const printed = `${postfix}${explainNode(expression, node, ctx)}`;
        result.push(renderBlock(ctx, printed, index, node.expressions.length));
      }
      break;
    }

    case SyntaxKind.Char: {
      // eslint-disable-next-line no-control-regex
      const isWhitespace = /\s/.test(node.value);
      let color: Formatter;

      if (types.isCharClassNode(parentNode)) {
        color = x => paint(x, colorMap.dim);
      } else if (node.type === CharType.Unicode || node.type === CharType.Hex || node.type === CharType.Octal) {
        color = assignColor(node, parentNode, ctx, colorMap.expression);
      } else {
        color = assignColor(node, parentNode, ctx, isWhitespace ? colorMap.whitespace : colorMap.char);
      }
      const char = isWhitespace
        ? paint(renderingPrimitives.whitespace, colorMap.whitespace)
        : paint(node.value, colorMap.secondaryHeader);
      const title = `Literally ${resetEnd(char)}`;
      result.push(
        `${title}${
          node.value !== rawPrinted && node.type !== CharType.Simple
            ? ` ${paint(`(raw ${node.type}`, colorMap.secondary)} ${color(rawPrinted)}${paint(')', colorMap.secondary)}`
            : ''
        }`,
      );
      break;
    }

    case SyntaxKind.ControlEscapeChar: {
      const color = assignColor(node, parentNode, ctx, colorMap.expression);
      result.push(`${color(paint(controlEscapeCharTitle[node.type], colorMap.header))} ${printed}`);
      break;
    }

    case SyntaxKind.Subpattern: {
      const color = assignColor(node, parentNode, ctx, colorMap.groupName);
      result.push(`${color(paint(`Group reference: '${node.groupName}'`, colorMap.header))} ${printed}`);
      break;
    }

    case SyntaxKind.CharRange: {
      const fromCode = node.from.value.charCodeAt(0);
      const toCode = node.to.value.charCodeAt(0);
      const charCount = toCode - fromCode + 1;
      const maxCharCount = 15;
      result.push(
        `${paint(`${printNode(source, node.from)}-${printNode(source, node.to)}`, colorMap.secondaryHeader)} ${paint(
          'character range',
          colorMap.secondary,
        )} ${paint(`(from index ${fromCode} to index ${toCode})`, colorMap.dim)}`,
      );

      result.push(
        addIndent(
          paint(
            Array.from({ length: Math.min(charCount, maxCharCount) })
              .map((_, i) => String.fromCharCode(fromCode + i))
              .join(', ') + (charCount > maxCharCount ? renderingPrimitives.ellipsis : ''),
            colorMap.dim,
          ),
          1,
          paint(renderingPrimitives.simpleBlockEnd, colorMap.border),
        ),
      );
      break;
    }

    case SyntaxKind.UnicodeProperty: {
      const color = assignColor(node, parentNode, ctx, colorMap.expression);
      const name = node.value ? `${node.value} in ${node.name}` : node.name;
      result.push(`${color(paint(`Unicode Property: ${name}`, colorMap.header))} ${printed}`);
      break;
    }

    case SyntaxKind.NonUnicodeProperty: {
      const color = assignColor(node, parentNode, ctx, colorMap.expression);
      const name = node.value ? `${node.value} in ${node.name}` : node.name;
      result.push(`${color(paint(`Non Unicode Property: ${name}`, colorMap.header))} ${printed}`);
      break;
    }

    default: {
      const title = genericNodeTitle[node.kind];
      if (title) {
        const name = types.isCharClassNode(parentNode)
          ? paint(title.header, colorMap.secondaryHeader)
          : 'color' in title
          ? assignColor(node, parentNode, ctx, colorMap[title.color])(paint(title.header, colorMap.header))
          : paint(title.header, colorMap.secondaryHeader);
        result.push(
          `${name}${'description' in title ? ` ${paint(title.description, colorMap.secondary)}` : ''} ${printed}`,
        );
      } else {
        //   should be never, if all nodes supported.
        // const unsupportedKind: Exclude<typeof node.kind, keyof typeof genericNodeTitle> = node.kind;
        result.push(`Node ${printed}`);
      }
    }
  }

  return result.join('\n');
};

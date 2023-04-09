import { type AnyRegexpNode, CharType, printRegexpNode, SyntaxKind, types } from 'ecma-262-regexp-parser';
import { Graph } from './graph.js';
import type { ExplainRenderer } from '../renderer.js';
import type { Formatter } from './console.js';
import {
  bold,
  colorStringPart,
  create256ColorsBgFormatter,
  create256ColorsFormatter,
  create256ColorsTextFormatter,
  dim,
  inverse,
  italic,
  resetEnd,
} from './console.js';

type Colors = [Formatter, ...Formatter[]] | Formatter;

type ColorMap = Record<
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

type CLIRendererCtx = {
  nodesGraph: Graph<AnyRegexpNode>;
  assignedColors: Map<AnyRegexpNode, Formatter>;
};

const INDENT = 1;

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
  whitespace: '·',
  dash: '—',
} as const;

const flagDescriptions = {
  g: `Performs a global match, finding all matches rather than just the first.`,
  i: `Makes matches case-insensitive. Matches both uppercase and lowercase.`,
  m: `Performs multiline matches. (Changes behavior of ^,$)`,
  s: `Allows . to match newline characters.`,
  u: `Enables Unicode support.`,
  y: `Matches are sticky, looking only at exact position in the text.`,
};

const id = <T>(x: T): T => x;

const emptyColorMap: ColorMap = {
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

const colorMapFor256Colors: ColorMap = {
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

const pickColor = (color: Colors, index = 0): Formatter => {
  if (Array.isArray(color)) {
    const pickedColor = color.at(Math.min(color.length - 1, index));
    if (!pickedColor) {
      throw new Error('Colors has gaps in array');
    }
    return pickedColor;
  } else {
    return color;
  }
};

const paint = (content: string, color: Colors, index = 0) => {
  return pickColor(color, index)(content);
};

const shouldWrapInBlock = (node: AnyRegexpNode) =>
  !types.isDisjunctionNode(node) &&
  !(types.isAlternativeNode(node) && node.expressions.length) &&
  !types.isCharClassNode(node);

const renderBlock = (colorMap: ColorMap, content: string, index = 0, of = 1): string => {
  const borderColor: Formatter = x => paint(x, colorMap.border);
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

const printNode = (node: AnyRegexpNode): string => {
  const printed = printRegexpNode(node);

  const maxLength = 70;
  if (printed.length > maxLength) {
    return printed.slice(0, maxLength - renderingPrimitives.ellipsis.length) + renderingPrimitives.ellipsis;
  } else {
    return printed;
  }
};

const assignColor = (
  node: AnyRegexpNode,
  parentNode: AnyRegexpNode,
  ctx: CLIRendererCtx,
  colors: Colors,
): Formatter => {
  let color = ctx.assignedColors.get(node);
  if (!color) {
    const graphNode = ctx.nodesGraph.addChild(parentNode, node);
    color = pickColor(colors, graphNode.level - 1);
    ctx.assignedColors.set(node, color);
  }
  return color;
};

const createExplainerContext = (): CLIRendererCtx => ({
  nodesGraph: new Graph(),
  assignedColors: new Map(),
});

const addIndent = (string: string, level = 1, prefix: string = ''): string => {
  return string || level === 0
    ? string.replace(/^(\s*)/gm, `${prefix}$1${' '.repeat(Math.max(0, INDENT * level))}`)
    : prefix;
};

export const createCliRenderer = (enableColors: boolean): ExplainRenderer<string> => {
  const ctx = createExplainerContext();
  const colorMap = enableColors ? colorMapFor256Colors : emptyColorMap;
  const nodeColors: Record<SyntaxKind, { color: Colors; title: Colors }> = {
    [SyntaxKind.Regexp]: { color: id, title: id },
    [SyntaxKind.Alternative]: { color: id, title: id },
    [SyntaxKind.Repetition]: { color: id, title: colorMap.secondaryHeader },
    [SyntaxKind.Char]: { color: colorMap.char, title: colorMap.secondaryHeader },
    [SyntaxKind.Group]: { color: colorMap.group, title: colorMap.header },
    [SyntaxKind.Disjunction]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.GroupName]: { color: colorMap.expression, title: colorMap.secondaryHeader },
    [SyntaxKind.NullChar]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.AnyWhitespace]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.NonWhitespace]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.ASCIIControlChar]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.AnyChar]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.LineStart]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.LineEnd]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.AnyWord]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.NonWord]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.AnyDigit]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.NonDigit]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.Backspace]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.Quantifier]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.WordBoundary]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.NonWordBoundary]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.BackReference]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.ControlEscapeChar]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.CharClass]: { color: colorMap.charClass, title: colorMap.header },
    [SyntaxKind.Subpattern]: { color: colorMap.groupName, title: colorMap.header },
    [SyntaxKind.CharRange]: { color: id, title: colorMap.secondaryHeader },
    [SyntaxKind.UnicodeProperty]: { color: colorMap.expression, title: colorMap.header },
    [SyntaxKind.NonUnicodeProperty]: { color: colorMap.expression, title: colorMap.header },
  };

  return {
    init(rootNode) {
      ctx.nodesGraph.add(rootNode);
    },
    renderRoot(regexp, flags, body) {
      const separator = paint(renderingPrimitives.horizontalSeparator, colorMap.border);
      return [regexp, flags, body].filter(Boolean).join(`\n${separator}\n`);
    },
    renderFlags(flags) {
      return addIndent(
        flags
          .split('')
          .map(
            x =>
              `${paint(x, colorMap.secondaryHeader)} ${renderingPrimitives.dash} ${paint(
                x in flagDescriptions ? flagDescriptions[x as keyof typeof flagDescriptions] : 'Unknown.',
                colorMap.secondary,
              )}`,
          )
          .join('\n'),
      );
    },
    renderRegexp(node) {
      const renderQueue: AnyRegexpNode[] = [];
      const source = printRegexpNode(node);
      let coloredRegexp = source.replace(/\s/g, renderingPrimitives.whitespace);

      if (source.length <= 400 && ctx.assignedColors.size <= 150) {
        ctx.nodesGraph.bfs(node, currentNode => renderQueue.push(currentNode.value));
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
    },
    beforeNodeExplain(parentNode, node) {
      const kindColors = nodeColors[node.kind];
      assignColor(node, parentNode, ctx, kindColors.color);
    },
    // eslint-disable-next-line complexity
    renderNodeExplain(title, parentNode, node, children) {
      const kindColors = nodeColors[node.kind];
      const color = assignColor(node, parentNode, ctx, kindColors.color);
      const rawPrinted = printRegexpNode(node);
      const printed = paint(rawPrinted, colorMap.dim);

      switch (node.kind) {
        case SyntaxKind.Regexp: {
          const child = Array.isArray(children) ? children.join('') : children ?? '';
          if (shouldWrapInBlock(node.body)) {
            return renderBlock(colorMap, child);
          }
          return child;
        }

        case SyntaxKind.Alternative: {
          if (Array.isArray(children)) {
            return children.length
              ? children.map((x, i, a) => renderBlock(colorMap, x, i, a.length)).join('\n')
              : paint(paint('Zero Length', colorMap.header), colorMap.inverse);
          }
          return renderBlock(colorMap, children ?? '');
        }

        case SyntaxKind.Group: {
          const header = `${color(paint(title, nodeColors[node.kind].title))} ${printed}`;
          if (Array.isArray(children)) {
            return [header, ...children.map(x => addIndent(x))].join('\n');
          }
          if (children) {
            return [header, children].join('\n');
          }
          return header;
        }

        case SyntaxKind.Disjunction: {
          const result: string[] = [];
          const shouldRenderNode = (node: AnyRegexpNode) =>
            !(types.isAlternativeNode(node) && node.expressions.length === 0);

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

            result.push(color(paint(title, kindColors.title)));
            result.push(
              `${paint('maybe', colorMap.secondary)} ${
                shouldRenderNode(deepestLeftNode) ? paint(printNode(deepestLeftNode), colorMap.dim) : ''
              }`,
            );
          }

          if (Array.isArray(children)) {
            result.push(
              ...children.map((x, i) => {
                if (i === 0) {
                  return x;
                }

                return [
                  `${paint('or', colorMap.secondary)} ${
                    shouldRenderNode(node.right) ? paint(printNode(node.right), colorMap.dim) : ''
                  }`,
                  x,
                ].join('\n');
              }),
            );
          } else {
            result.push(children ?? '');
          }

          return result.join('\n');
        }

        case SyntaxKind.Repetition:
        case SyntaxKind.BackReference: {
          const partials = Array.isArray(children) ? children : (children ?? '').split('\n');
          return [
            `${partials.shift() ?? ''} ${renderingPrimitives.referenceArrow} ${paint(
              paint(title, kindColors.title),
              colorMap.secondary,
            )}`,
            ...partials,
          ].join('\n');
        }

        case SyntaxKind.CharClass: {
          const postfix = node.expressions.length > 1 ? paint('or ', colorMap.dim) : '';
          const result: string[] = [];

          result.push(`${color(paint(title, colorMap.header))} ${printed}`);

          if (Array.isArray(children)) {
            for (const [index, child] of children.entries()) {
              const printed = `${postfix}${child}`;
              result.push(renderBlock(colorMap, printed, index, node.expressions.length));
            }
          } else if (children) {
            result.push(children);
          }

          return result.join('\n');
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
          const charTitle = `Literally ${enableColors ? resetEnd(char) : char}`;
          return [
            charTitle,
            node.value !== rawPrinted && node.type !== CharType.Simple
              ? ` ${paint(`(raw ${node.type}`, colorMap.secondary)} ${color(rawPrinted)}${paint(
                  ')',
                  colorMap.secondary,
                )}`
              : '',
          ].join('');
        }

        case SyntaxKind.CharRange: {
          const fromCode = node.from.value.charCodeAt(0);
          const toCode = node.to.value.charCodeAt(0);
          const charCount = toCode - fromCode + 1;
          const maxCharCount = 15;
          const result: string[] = [];
          result.push(
            `${paint(
              `${printNode(node.from)}${renderingPrimitives.dash}${printNode(node.to)}`,
              colorMap.secondaryHeader,
            )} ${paint('character range', colorMap.secondary)} ${paint(
              `(from index ${fromCode} to index ${toCode})`,
              colorMap.dim,
            )}`,
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
          return result.join('\n');
        }

        default: {
          const header = `${color(paint(title, nodeColors[node.kind].title))} ${printed}`;
          if (Array.isArray(children)) {
            return [header, ...children.map(x => addIndent(x))].join('\n');
          }
          if (children) {
            return [header, children].join('\n');
          }
          return header;
        }
      }
    },
  };
};

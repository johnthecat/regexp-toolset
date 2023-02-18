import type { AnyRegexpNode, RegexpNode } from 'ecma-262-regexp-parser';
import { SyntaxKind } from 'ecma-262-regexp-parser';
import {
  type Formatter,
  addIndent,
  bold,
  colorStringPart,
  create256ColorsBgFormatter,
  create256ColorsFormatter,
  create256ColorsTextFormatter,
  dim,
  italic,
  pluralCount,
  resetEnd,
} from './common/console.js';
import { Graph } from './common/graph.js';

type ExplainerContext = {
  enableColors: boolean;
  source: string;
  capturingGroups: number;
  rootColors: Map<number, Map<AnyRegexpNode, Formatter>>;
  colors: Map<AnyRegexpNode, Formatter>;
  nodesGraph: Graph<AnyRegexpNode>;
};

type Colors = Formatter[];
type Id<T> = (x: T) => T;

const pipe = <T>(...fns: Id<T>[]): Id<T> => {
  return x => {
    let result = x;
    for (const fn of fns) {
      result = fn(result);
    }
    return result;
  };
};

const id = <T>(x: T): T => x;

const whitespaceReplacer = '•';

const flagDescriptions = {
  g: `Performs a global match, finding all matches rather than just the first.`,
  i: `Makes matches case-insensitive. Matches both uppercase and lowercase.`,
  m: `Performs multiline matches. (Changes behavior of ^,$)`,
  s: `Allows . to match newline characters.`,
  u: `Enables Unicode support.`,
  y: `Matches are sticky, looking only at exact position in the text.`,
};

const borderColor = create256ColorsTextFormatter(247);

const defaultExpressionColor = create256ColorsFormatter(32, 255);
const whitespaceColor = pipe(create256ColorsBgFormatter(255), dim);
const defaultCharColor = create256ColorsFormatter(255, 0);
const groupColors: Colors = [
  create256ColorsBgFormatter(148),
  create256ColorsBgFormatter(113),
  create256ColorsFormatter(30, 255),
  create256ColorsFormatter(31, 255),
];
const charClassColors = create256ColorsFormatter(223, 0);
const groupNameColors = create256ColorsFormatter(127, 255);

const genericNodeTitle = {
  [SyntaxKind.GroupName]: { header: 'Group name', color: defaultExpressionColor },
  [SyntaxKind.FormFeedChar]: { header: 'Form Feed Char', color: defaultExpressionColor },
  [SyntaxKind.NullChar]: { header: 'Null', color: defaultExpressionColor },
  [SyntaxKind.AnyWhitespace]: { header: 'Any Whitespace', color: defaultExpressionColor },
  [SyntaxKind.NonWhitespace]: { header: 'Non Whitespace', color: defaultExpressionColor },
  [SyntaxKind.ControlChar]: { header: 'ASCII Control', color: defaultExpressionColor },
  [SyntaxKind.AnyChar]: { header: 'Any', color: defaultExpressionColor },
  [SyntaxKind.LineStart]: { header: 'Line Start', color: defaultExpressionColor },
  [SyntaxKind.LineEnd]: { header: 'Line End', color: defaultExpressionColor },
  [SyntaxKind.AnyWord]: { header: 'Any Word', description: 'matches [A-z0-9_]', color: defaultExpressionColor },
  [SyntaxKind.NonWord]: { header: 'Non Word', description: 'matches [^A-z0-9_]', color: defaultExpressionColor },
  [SyntaxKind.AnyDigit]: { header: 'Any Digit', description: 'matches [0-9]', color: defaultExpressionColor },
  [SyntaxKind.NonDigit]: { header: 'Non Digit', description: 'matches [^0-9]', color: defaultExpressionColor },
  [SyntaxKind.Backspace]: { header: 'Backspace', color: defaultExpressionColor },
  // TODO implement as repetition
  [SyntaxKind.BackReference]: { header: 'BackReference' },
  [SyntaxKind.NewLine]: { header: 'New Line', color: defaultExpressionColor },
  [SyntaxKind.VerticalWhitespace]: { header: 'Vertical Whitespace', color: defaultExpressionColor },
  [SyntaxKind.ZeroLength]: { header: 'Zero Length' },
  [SyntaxKind.CarriageReturn]: { header: 'Carriage Return', color: defaultExpressionColor },
  [SyntaxKind.Tab]: { header: 'Tab', color: defaultExpressionColor },
  [SyntaxKind.Quantifier]: { header: 'Quantifier', color: defaultExpressionColor },
} satisfies Record<SyntaxKind, { header: string; description?: string; color?: Colors | Formatter }>;

const renderAfterBlock = (content: string, index = 0, of = 1): string => {
  const isFirst = index === 0;
  const isLast = index === of - 1;

  if (content.includes('\n')) {
    const parts = content.split('\n').map((x, i) => `${borderColor(i === 0 ? (isFirst ? '╭' : '┌') : '│')} ${x}`);
    parts.push(borderColor('┕ ·'));
    return parts.join('\n');
  }

  if (isFirst && isLast) {
    return `${borderColor('·')} ${content}`;
  }

  if (isFirst) {
    return `${borderColor('╭')} ${content}`;
  }

  if (isLast) {
    return `${borderColor('╰')} ${content}`;
  }

  return `${borderColor('╎')} ${content}`;
};

const printNode = (source: string, node: AnyRegexpNode): string => {
  if (node.end - node.start > 70) {
    return source.slice(node.start, node.start + 67) + '...';
  } else {
    return source.slice(node.start, node.end + 1);
  }
};

const header = (x: string, color: Formatter = id) => {
  return color(x) === x ? bold(x) : color(bold(` ❱ ${x} `));
};

const secondary = italic;

const assignColor = (
  node: AnyRegexpNode,
  parentNode: AnyRegexpNode,
  ctx: ExplainerContext,
  colors: Colors | Formatter = defaultExpressionColor,
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
  ctx.colors.set(node, color);
  return color;
};

export const explainRegexp = (regexp: RegexpNode, source: string, config: { enableColors: boolean }): string => {
  return explainNode(regexp, regexp, {
    source: source.replace(/\s/gm, whitespaceReplacer),
    nodesGraph: new Graph(),
    rootColors: new Map(),
    colors: new Map(),
    capturingGroups: 0,
    enableColors: config.enableColors,
  });
};

// eslint-disable-next-line complexity
export const explainNode = (node: AnyRegexpNode, parentNode: AnyRegexpNode, ctx: ExplainerContext): string => {
  const { source, colors } = ctx;
  const rawPrinted = printNode(source, node);
  const printed = dim(rawPrinted.length > 70 ? rawPrinted.slice(0, 67) + '...' : rawPrinted);
  const result: string[] = [];

  switch (node.kind) {
    case SyntaxKind.Regexp: {
      ctx.nodesGraph.add(node);
      const childNodes = explainNode(node.body, node, ctx);
      let coloredRegexp = ctx.source;
      const renderQueue: AnyRegexpNode[] = [];

      if (source.length <= 400 && colors.size <= 150) {
        ctx.nodesGraph.bfs(node, currentNode => renderQueue.push(currentNode));
        renderQueue.reverse();
        for (const currentNode of renderQueue) {
          const color = colors.get(currentNode);
          if (!color) {
            continue;
          }
          coloredRegexp = colorStringPart(coloredRegexp, currentNode.start, currentNode.end, color);
        }
      }

      const mainBlock = [borderColor('┄'.repeat(15)), childNodes];

      if (node.flags) {
        mainBlock.unshift(
          borderColor('┄'.repeat(15)),
          header('Flags'),
          addIndent(
            node.flags
              .split('')
              .map(
                x =>
                  `${bold(x)} - ${secondary(
                    x in flagDescriptions ? flagDescriptions[x as keyof typeof flagDescriptions] : 'Unknown.',
                  )}`,
              )
              .join('\n'),
          ),
        );
      }

      result.push(addIndent(coloredRegexp), addIndent(mainBlock.join('\n')));
      break;
    }

    case SyntaxKind.Disjunction: {
      const color = assignColor(node, parentNode, ctx);

      if (parentNode.kind !== SyntaxKind.Disjunction) {
        result.push(header('Disjunction', color), `${secondary('maybe')} ${dim(printNode(source, node.left))}`);
      }
      let left = explainNode(node.left, node, ctx);
      let right = explainNode(node.right, node, ctx);
      if (
        node.left.kind !== SyntaxKind.Disjunction &&
        node.left.kind !== SyntaxKind.Alternative &&
        node.left.kind !== SyntaxKind.CharClass
      ) {
        left = renderAfterBlock(left);
      }
      if (
        node.right.kind !== SyntaxKind.Disjunction &&
        node.right.kind !== SyntaxKind.Alternative &&
        node.right.kind !== SyntaxKind.CharClass
      ) {
        right = renderAfterBlock(right);
      }
      result.push(left, `${secondary('or')} ${dim(printNode(source, node.right))}`, right);
      break;
    }

    case SyntaxKind.Alternative: {
      for (const [index, expression] of node.expressions.entries()) {
        const printed = explainNode(expression, parentNode, ctx);
        result.push(renderAfterBlock(printed, index, node.expressions.length));
      }
      break;
    }

    case SyntaxKind.Group: {
      const groupColor = assignColor(node, parentNode, ctx, groupColors);
      let headerText: string;
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
      if (
        node.body.kind !== SyntaxKind.Disjunction &&
        node.body.kind !== SyntaxKind.Alternative &&
        node.body.kind !== SyntaxKind.CharClass
      ) {
        child = renderAfterBlock(child);
      }
      result.push(`${header(headerText, groupColor)} ${printed}`, child);
      break;
    }

    case SyntaxKind.Repetition: {
      let repetition: string;

      switch (node.quantifier.type) {
        case 'oneOrMany':
          repetition = 'between one and unlimited times' + (!node.quantifier.greedy ? ' (lazy)' : '');
          break;
        case 'zeroOrOne':
          repetition = 'between zero and one times' + (!node.quantifier.greedy ? ' (lazy)' : '');
          break;
        case 'zeroOrMany':
          repetition = 'between zero and unlimited times' + (!node.quantifier.greedy ? ' (lazy)' : '');
          break;
        case 'range':
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
      assignColor(node.quantifier, parentNode, ctx);

      const partials = childNode.split('\n');
      const transformedResult = [`${partials.shift()!} « ${secondary(bold(repetition))}`, ...partials].join('\n');

      result.push(transformedResult);
      break;
    }

    case SyntaxKind.CharClass: {
      const color = assignColor(node, parentNode, ctx, charClassColors);
      const postfix = node.expressions.length > 1 ? italic(dim('or ')) : '';

      result.push(`${header((node.negative ? 'Negative ' : '') + 'Character Class', color)} ${printed}`);

      for (const [index, expression] of node.expressions.entries()) {
        const printed = `${postfix}${explainNode(expression, node, ctx)}`;
        result.push(renderAfterBlock(printed, index, node.expressions.length));
      }
      break;
    }

    case SyntaxKind.Char: {
      // eslint-disable-next-line no-control-regex
      const isWhitespace = /\s/.test(node.value);
      let color: Formatter;

      if (parentNode.kind === SyntaxKind.CharClass) {
        color = dim;
      } else if (node.type === 'unicode' || node.type === 'hex' || node.type === 'octal') {
        color = assignColor(node, parentNode, ctx, defaultExpressionColor);
      } else {
        color = assignColor(node, parentNode, ctx, isWhitespace ? whitespaceColor : defaultCharColor);
      }
      const title = `${secondary('Literally')} ${resetEnd(bold(isWhitespace ? whitespaceReplacer : node.value))}`;
      result.push(
        `${title}${
          node.value !== rawPrinted && node.type !== 'simple'
            ? ` ${secondary(`(raw ${node.type}`)} ${color(rawPrinted)}${secondary(')')}`
            : ''
        }`,
      );
      break;
    }

    case SyntaxKind.Subpattern: {
      const color = assignColor(node, parentNode, ctx, groupNameColors);
      result.push(`${header(`Group reference: '${node.groupName}'`, color)} ${printed}`);
      break;
    }

    case SyntaxKind.CharRange: {
      result.push(
        `${bold(`${printNode(source, node.from)}-${printNode(source, node.to)}`)} ${secondary('range')} ${dim(
          `(from index ${node.from.value.charCodeAt(0)} to index ${node.to.value.charCodeAt(0)})`,
        )}`,
      );
      break;
    }

    default: {
      const kind = node.kind;
      if (genericNodeTitle[kind]) {
        const title = genericNodeTitle[kind];
        const color =
          parentNode.kind === SyntaxKind.CharClass
            ? String
            : 'color' in title && title.color
            ? assignColor(node, parentNode, ctx, title.color)
            : String;
        result.push(
          `${header(title.header, color)}${
            'description' in title && title.description ? ` ${secondary(title.description)}` : ''
          } ${printed}`,
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

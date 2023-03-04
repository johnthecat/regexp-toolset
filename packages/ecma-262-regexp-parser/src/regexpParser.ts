import type { RegexpTokenizer, Step } from './regexpTokenizer.js';
import {
  isBracketsCloseToken,
  isBracketsOpenToken,
  isEscapedCharToken,
  isParenthesesCloseToken,
  isParenthesesOpenToken,
  isPatternCharToken,
  isSyntaxCharToken,
  TokenKind,
} from './regexpTokenizer.js';
import { ParsingError } from './common/parsingError.js';
import type {
  AnyCharNode,
  AnyDigitNode,
  AnyRegexpNode,
  AnyWhitespaceNode,
  AnyWordNode,
  BackspaceNode,
  GroupNameNode,
  GroupNode,
  LineEndNode,
  LineStartNode,
  NodePosition,
  NonDigitNode,
  NonWhitespaceNode,
  NonWordBoundaryNode,
  NonWordNode,
  NullCharNode,
  RegexpNode,
  SubpatternNode,
  WordBoundaryNode,
} from './regexpNodes.js';
import { ControlEscapeCharType, QuantifierType, SyntaxKind } from './regexpNodes.js';
import * as factory from './regexpNodeFactory.js';
import { createRegexpNode, createSimpleNode, isCharNode } from './regexpNodeFactory.js';
import type { ParserContext, SingleNodeParser, NodeParser } from './regexpParseTypes.js';
import { hexMatcher, matchTokenSequence, numberMatcher, octalMatcher, wordMatcher } from './regexpSequenceMatcher.js';
import { fillExpressions } from './regexpParseUtils.js';
import { replace } from './common/array.js';
import type { Monad } from './common/match.js';
import { matched, unmatched, errored, matchFirst } from './common/match.js';

// TODO
// Unicode property (\p{Russian})
// Non Unicode property (\P{Russian})

const commonErrorMessages = {
  EOL: 'Unexpected end of line',
  UnexpectedToken: 'Unexpected token',
};

function assertNullable<T>(x: T, error: Error): asserts x is NonNullable<T> {
  if (x === null || x === void 0) {
    throw error;
  }
}

export const createParserContext = (source: string, tokenizer: RegexpTokenizer): ParserContext => ({
  source,
  tokenizer,
  foundGroupSpecifiers: new Map(),
  groupSpecifierDemands: new Set(),
  reportError: (position, message) => {
    let normalizedPosition: NodePosition;
    if (typeof position === 'number') {
      normalizedPosition = { start: position, end: position };
    } else {
      normalizedPosition = {
        start: position.start ?? 0,
        end: position.end ?? source.length,
      };
    }
    return new ParsingError(source, normalizedPosition.start, normalizedPosition.end, message);
  },
});

const connectSubpatternsWithGroups = (ctx: ParserContext): Monad<void> => {
  for (const [tag, node] of ctx.groupSpecifierDemands) {
    const found = ctx.foundGroupSpecifiers.get(tag);
    if (!found) {
      return errored(ctx.reportError(node, `This token references a non-existent or invalid subpattern`));
    }
    node.ref = found;
  }

  return matched(void 0);
};

export const parseRegexp: SingleNodeParser<RegexpNode> = (firstToken, ctx) => {
  if (!isPatternCharToken(firstToken, '/')) {
    return errored(ctx.reportError(0, 'Regexp should start with "/" symbol, like this: /.../gm'));
  }

  const firstContentToken = firstToken.next();
  if (!firstContentToken) {
    return errored(ctx.reportError({ start: firstToken.start }, "Can't parse input"));
  }

  return fillExpressions(firstContentToken, ctx, parseTokenInRegexp)
    .matched(({ nodes, token: closingToken }) => {
      if (!isPatternCharToken(closingToken, '/')) {
        return errored(ctx.reportError(closingToken, 'Regexp body should end with "/" symbol, like this: /.../gm'));
      }

      const firstFlagToken = closingToken.next();
      const regexpNode = createRegexpNode(nodes, firstFlagToken ? parseFlags(firstFlagToken, ctx) : '');
      return connectSubpatternsWithGroups(ctx).map(() => ({ node: regexpNode, token: firstFlagToken }));
    })
    .unmatched(() => errored(ctx.reportError(firstToken, "Can't parse input")));
};

const parseFlags = (step: Step, ctx: ParserContext): string => {
  const supportedFlags = ['g', 'i', 'm', 's', 'u', 'y'];

  let result = '';
  let currentStep = step;
  while (currentStep) {
    if (!isPatternCharToken(currentStep) || !/[a-z]/.test(currentStep.value)) {
      throw ctx.reportError(currentStep, commonErrorMessages.UnexpectedToken);
    }

    if (!supportedFlags.includes(currentStep.value)) {
      throw ctx.reportError(currentStep, `Unknown flag "${currentStep.value}"`);
    }
    result += currentStep.value;

    const nextStep = currentStep.next();
    if (!nextStep) {
      break;
    }
    currentStep = nextStep;
  }

  return result;
};

const isQuantifiable = (node: AnyRegexpNode) =>
  node.kind === SyntaxKind.Char ||
  node.kind === SyntaxKind.CharClass ||
  node.kind === SyntaxKind.Group ||
  node.kind === SyntaxKind.ControlEscapeChar ||
  node.kind === SyntaxKind.AnyChar ||
  node.kind === SyntaxKind.AnyWord ||
  node.kind === SyntaxKind.NonWord ||
  node.kind === SyntaxKind.AnyDigit ||
  node.kind === SyntaxKind.NonDigit ||
  node.kind === SyntaxKind.AnyWhitespace ||
  node.kind === SyntaxKind.NonWhitespace;

// Implementation .* ; .+ ; .? - quantifiers
export const parseQuantifier: NodeParser = (token, nodes, ctx) => {
  const prevNode = nodes.at(-1);
  assertNullable(prevNode, ctx.reportError(token, 'There is nothing to quantify'));
  if (!isQuantifiable(prevNode)) {
    return errored(ctx.reportError(token, 'The preceding token is not quantifiable'));
  }

  return matchTokenSequence(token, [TokenKind.SyntaxChar, [TokenKind.SyntaxChar, { value: '?' }]]).flatMap(lazy => {
    const quantifierNode = factory.createQuantifierNode(lazy.match ? lazy.value : token, {
      type:
        token.value === '?'
          ? QuantifierType.NoneOrSingle
          : token.value === '+'
          ? QuantifierType.SingleOrMany
          : QuantifierType.NoneOrMany,
      greedy: !lazy.match,
    });
    return matched({
      nodes: replace(nodes, prevNode, factory.createRepetitionNode(prevNode, quantifierNode)),
      token: lazy.match ? lazy.value.token : token,
    });
  });
};

// Implementation Y{1} ; Y{1,} ; Y{1,2} - range quantifier
export const parseQuantifierRange: NodeParser = (token, nodes, ctx) => {
  const prevNode = nodes.at(-1);
  assertNullable(prevNode, ctx.reportError(token, 'There is nothing to quantify'));
  if (!isQuantifiable(prevNode)) {
    return errored(ctx.reportError(token, 'The preceding token is not quantifiable'));
  }

  const trySequence = (token: Step, nodes: AnyRegexpNode[], seq: Parameters<typeof matchTokenSequence<number>>[1]) =>
    matchTokenSequence<number>(token, seq).matched(range => {
      const from = range.values.at(0);
      const to = range.values.at(1);

      assertNullable(from, ctx.reportError(range, "Can't parse numeric values from range."));
      if (typeof to === 'number' && from > to) {
        return errored(ctx.reportError(range, 'The quantifier range is out of order'));
      }

      return matchTokenSequence(range.token, [TokenKind.SyntaxChar, [TokenKind.SyntaxChar, { value: '?' }]]).flatMap(
        lazy => {
          const quantifierNode = factory.createQuantifierNode(
            { start: range.start, end: lazy.match ? lazy.value.end : range.end },
            {
              greedy: !lazy.match,
              type: QuantifierType.Range,
              from,
              to,
            },
          );

          const repetitionNode = factory.createRepetitionNode(prevNode, quantifierNode);
          return matched({
            nodes: replace(nodes, prevNode, repetitionNode),
            token: lazy.match ? lazy.value.token : range.token,
          });
        },
      );
    });

  return trySequence(token, nodes, [
    [TokenKind.SyntaxChar, { value: '{' }],
    numberMatcher,
    [TokenKind.SyntaxChar, { value: '}' }],
  ])
    .unmatched(() =>
      trySequence(token, nodes, [
        [TokenKind.SyntaxChar, { value: '{' }],
        numberMatcher,
        [TokenKind.PatternChar, { value: ',' }, token => matched({ value: Number.POSITIVE_INFINITY, token })],
        [TokenKind.SyntaxChar, { value: '}' }],
      ]),
    )
    .unmatched(() =>
      trySequence(token, nodes, [
        [TokenKind.SyntaxChar, { value: '{' }],
        numberMatcher,
        [TokenKind.PatternChar, { value: ',' }],
        numberMatcher,
        [TokenKind.SyntaxChar, { value: '}' }],
      ]),
    );
};

// Implementation \k<...> - subpattern match
export const parseSubpatternMatch: NodeParser = (token, nodes, ctx) => {
  return matchTokenSequence(token, [
    [TokenKind.CharEscape, { value: 'k' }],
    [TokenKind.PatternChar, { value: '<' }],
    wordMatcher,
    [TokenKind.PatternChar, { value: '>' }],
  ]).matched(subpattern => {
    const groupName = subpattern.values.at(0);
    if (!groupName) {
      throw ctx.reportError(subpattern, `Can't parse subpattern name`);
    }
    const node: SubpatternNode = {
      kind: SyntaxKind.Subpattern,
      start: subpattern.start,
      end: subpattern.end,
      ref: null,
      groupName,
    };
    ctx.groupSpecifierDemands.add([groupName, node]);
    return matched({ nodes: nodes.concat(node), token: subpattern.token });
  });
};

// Implementation \0 - null char
export const parseNullChar: NodeParser = (token, nodes) => {
  if (token.value === '0') {
    return matched({ nodes: nodes.concat(factory.createSimpleNode<NullCharNode>(SyntaxKind.NullChar, token)), token });
  }

  return unmatched({ nodes, token });
};

// Implementation (...)\1 - back reference
export const parseBackReferenceChar: NodeParser = (token, nodes) => {
  const prevNode = nodes.at(-1);
  if (token.value === '1' && prevNode && prevNode.kind === SyntaxKind.Group) {
    const backReferenceNode = factory.createBackReferenceNode(
      {
        start: prevNode.start,
        end: token.end,
      },
      prevNode,
    );
    return matched({ nodes: replace(nodes, prevNode, backReferenceNode), token });
  }
  return unmatched({ nodes, token });
};

// Implementation [\b] - backspace
export const parseBackspace: NodeParser = (token, nodes) => {
  if (isEscapedCharToken(token, 'b')) {
    return matched({
      nodes: nodes.concat(factory.createSimpleNode<BackspaceNode>(SyntaxKind.Backspace, token)),
      token,
    });
  }
  return unmatched({ nodes, token });
};

// Implementation .|. - disjunction
export const parseDisjunction: NodeParser = (separatorToken, nodes, ctx, recursiveFn = parseTokenInRegexp) => {
  const leftNodes = nodes;
  const nextToken = separatorToken.next();

  if (!nextToken) {
    return matched({ nodes: [factory.createDisjunctionNode(leftNodes, [], separatorToken)], token: separatorToken });
  }

  return fillExpressions(nextToken, ctx, (token, nodes, ctx) => {
    // creating tail recursion for correct nesting of multiple disjunctions
    if (isSyntaxCharToken(token, '|')) {
      return unmatched({ nodes, token: token.prev() });
    }
    return recursiveFn(token, nodes, ctx);
  }).map(({ nodes: rightNodes, token }) => ({
    nodes: [factory.createDisjunctionNode(leftNodes, rightNodes, separatorToken)],
    token: token.prev(),
  }));
};

// Implementation ^... - line start
export const parseLineStart: NodeParser = (token, nodes) =>
  matched({ nodes: nodes.concat(factory.createSimpleNode<LineStartNode>(SyntaxKind.LineStart, token)), token });

// Implementation ...$ - line end
export const parseLineEnd: NodeParser = (token, nodes) =>
  matched({ nodes: nodes.concat(factory.createSimpleNode<LineEndNode>(SyntaxKind.LineEnd, token)), token });

// Implementation . - any character
export const parseAnyChar: NodeParser = (token, nodes) =>
  matched({ nodes: nodes.concat(factory.createSimpleNode<AnyCharNode>(SyntaxKind.AnyChar, token)), token });

// eslint-disable-next-line complexity
export const parseTokenInRegexp: NodeParser = (token, nodes, ctx, recursiveFn = parseTokenInRegexp) => {
  switch (token.kind) {
    case TokenKind.CharClassEscape:
      return parseCharClassEscape(token, nodes, ctx);

    case TokenKind.ControlEscape:
      return parseControlEscapeHandler(token, nodes, ctx);

    case TokenKind.CharEscape:
      switch (token.value) {
        case 'b':
          return matched({
            nodes: nodes.concat(createSimpleNode<WordBoundaryNode>(SyntaxKind.WordBoundary, token)),
            token,
          });
        case 'B':
          return matched({
            nodes: nodes.concat(createSimpleNode<NonWordBoundaryNode>(SyntaxKind.NonWordBoundary, token)),
            token,
          });
        case 'k':
          return matchFirst([() => parseSubpatternMatch(token, nodes, ctx), () => parseEscapedChar(token, nodes, ctx)]);
        default:
          return matchFirst([() => parseCharEscape(token, nodes, ctx), () => parseEscapedChar(token, nodes, ctx)]);
      }

    case TokenKind.DecimalEscape:
      return matchFirst([
        () => parseOctalChar(token, nodes, ctx),
        () => parseNullChar(token, nodes, ctx),
        () => parseBackReferenceChar(token, nodes, ctx),
        () => parseEscapedChar(token, nodes, ctx),
      ]);

    case TokenKind.PatternChar:
      switch (token.value) {
        case '/':
          // End of regexp body
          return unmatched({ nodes, token });

        default:
          return parseSimpleChar(token, nodes, ctx);
      }

    case TokenKind.Decimal:
      return parseSimpleChar(token, nodes, ctx);

    case TokenKind.SyntaxChar:
      switch (token.value) {
        case '[':
          return parseCharClass(token, nodes, ctx);

        case '{':
          return matchFirst([() => parseQuantifierRange(token, nodes, ctx), () => parseSimpleChar(token, nodes, ctx)]);

        case '(':
          return parseCapturingGroup(token, nodes, ctx);

        case '^':
          return parseLineStart(token, nodes, ctx);

        case '$':
          return parseLineEnd(token, nodes, ctx);

        case '.':
          return parseAnyChar(token, nodes, ctx);

        case '*':
        case '+':
        case '?':
          return parseQuantifier(token, nodes, ctx);

        case '|':
          return parseDisjunction(token, nodes, ctx, recursiveFn);

        case '}':
          return parseSimpleChar(token, nodes, ctx);

        case ')':
          return errored(ctx.reportError(token, 'Unmatched parenthesis'));

        default:
          return errored(ctx.reportError(token, commonErrorMessages.UnexpectedToken));
      }
  }
};

// Implementation \uYYYY - unicode symbol code
export const parseUnicodeChar: NodeParser = (token, nodes, ctx) =>
  matchTokenSequence(token, [[TokenKind.CharEscape, { value: 'u' }], hexMatcher, hexMatcher]).matched(unicode => {
    const value = unicode.values.join('');
    if (!value) {
      return errored(ctx.reportError(token, `Can't parse value as unicode number`));
    }

    return matched({
      nodes: nodes.concat(factory.createCharNode(String.fromCharCode(parseInt(value, 16)), unicode, 'unicode')),
      token: unicode.token,
    });
  });

// Implementation \xYY - hex symbol code
export const parseHexChar: NodeParser = (token, nodes, ctx) =>
  matchTokenSequence(token, [[TokenKind.CharEscape, { value: 'x' }], hexMatcher]).map(hex => {
    const value = hex.values.at(0);
    assertNullable(value, ctx.reportError(token, `Can't parse value as hex code`));
    return {
      nodes: nodes.concat(factory.createCharNode(String.fromCharCode(parseInt(value, 16)), hex, 'hex')),
      token: hex.token,
    };
  });

// Implementation \ddd - octal char number
export const parseOctalChar: NodeParser = (token, nodes, ctx) =>
  matchTokenSequence(token, [octalMatcher]).matched(octal => {
    const value = octal.values.at(0);
    assertNullable(value, ctx.reportError(token, "Can't parse octal value"));

    return matched({
      nodes: nodes.concat(factory.createCharNode(String.fromCodePoint(parseInt(value, 8)), octal, 'octal')),
      token: octal.token,
    });
  });

// Implementation \cA - ASCII control char
export const parseASCIIControlChar: NodeParser = (token, nodes, ctx) => {
  const nextToken = token.next();
  if (!nextToken || isPatternCharToken(nextToken, '/')) {
    return unmatched({ nodes, token });
  }

  if (!/[A-Za-z]/.test(nextToken.value)) {
    return errored(ctx.reportError({ start: token.start, end: nextToken.end }, 'Invalid control character'));
  }
  const node = factory.createASCIIControlCharNode(nextToken.value.toUpperCase(), {
    start: token.start,
    end: nextToken.end,
  });
  return matched({ nodes: nodes.concat(node), token: nextToken });
};

// Implementation (...) - capturing group
// eslint-disable-next-line complexity
export const parseCapturingGroup: NodeParser = (firstToken, parentNodes, ctx) => {
  if (!isParenthesesOpenToken(firstToken)) {
    return errored(ctx.reportError(firstToken, 'Trying to parse expression as group, but got invalid input'));
  }
  const parseTokenInGroup: NodeParser = (token, nodes, ctx) => {
    if (isParenthesesOpenToken(token)) {
      return parseCapturingGroup(token, nodes, ctx);
    }

    // Closing group
    if (isParenthesesCloseToken(token)) {
      return unmatched({ nodes, token });
    }

    if (ctx.tokenizer.isLastToken(token)) {
      return errored(ctx.reportError({ start: firstToken.start, end: token.end }, 'Incomplete group structure'));
    }

    return parseTokenInRegexp(token, nodes, ctx, parseTokenInGroup);
  };

  let startStep: Step | null = firstToken.next();
  let specifier: GroupNameNode | null = null;
  let type: GroupNode['type'] = 'capturing';

  {
    // Implementation (?=...) - positive lookahead
    matchTokenSequence(firstToken, [
      [TokenKind.SyntaxChar, { value: '(' }],
      [TokenKind.SyntaxChar, { value: '?' }],
      [TokenKind.PatternChar, { value: '=' }],
    ]).matched(x => {
      startStep = x.token.next();
      type = 'positiveLookahead';
      return matched(x);
    });
  }

  {
    // Implementation (?!...) - negative lookahead
    matchTokenSequence(firstToken, [
      [TokenKind.SyntaxChar, { value: '(' }],
      [TokenKind.SyntaxChar, { value: '?' }],
      [TokenKind.PatternChar, { value: '!' }],
    ]).matched(x => {
      startStep = x.token.next();
      type = 'negativeLookahead';
      return matched(x);
    });
  }

  {
    // Implementation (?<=...) - positive lookbehind
    matchTokenSequence(firstToken, [
      [TokenKind.SyntaxChar, { value: '(' }],
      [TokenKind.SyntaxChar, { value: '?' }],
      [TokenKind.PatternChar, { value: '<' }],
      [TokenKind.PatternChar, { value: '=' }],
    ]).matched(x => {
      startStep = x.token.next();
      type = 'positiveLookbehind';
      return matched(x);
    });
  }

  {
    // Implementation (?<!...) - negative lookbehind
    matchTokenSequence(firstToken, [
      [TokenKind.SyntaxChar, { value: '(' }],
      [TokenKind.SyntaxChar, { value: '?' }],
      [TokenKind.PatternChar, { value: '<' }],
      [TokenKind.PatternChar, { value: '!' }],
    ]).matched(x => {
      startStep = x.token.next();
      type = 'negativeLookbehind';
      return matched(x);
    });
  }

  {
    // Implementation (?:...) - non-capturing group
    matchTokenSequence(firstToken, [
      [TokenKind.SyntaxChar, { value: '(' }],
      [TokenKind.SyntaxChar, { value: '?' }],
      [TokenKind.PatternChar, { value: ':' }],
    ]).matched(x => {
      startStep = x.token.next();
      type = 'nonCapturing';
      return matched(x);
    });
  }

  {
    // Implementation (?<tag_name>...) - named capturing group
    matchTokenSequence<string>(firstToken, [
      [TokenKind.SyntaxChar, { value: '(' }],
      [TokenKind.SyntaxChar, { value: '?' }],
      [TokenKind.PatternChar, { value: '<' }],
      wordMatcher,
      [TokenKind.PatternChar, { value: '>' }],
    ]).matched(groupName => {
      const name = groupName.values.at(0);

      assertNullable(name, ctx.reportError(groupName.token, "Can't parse group name"));
      if (ctx.foundGroupSpecifiers.has(name)) {
        return errored(ctx.reportError(groupName.token, `Group name '${name}' is already defined`));
      }

      startStep = groupName.token.next();
      specifier = factory.createGroupNameNode(name, { start: groupName.start + 2, end: groupName.end });

      return matched(groupName);
    });
  }

  assertNullable(startStep, ctx.reportError(firstToken, commonErrorMessages.EOL));

  return fillExpressions(startStep, ctx, parseTokenInGroup).matched(({ nodes, token: lastToken }) => {
    const node = factory.createGroupNode(type, specifier, nodes, {
      start: firstToken.start,
      end: lastToken.end,
    });

    if (specifier) {
      ctx.foundGroupSpecifiers.set(specifier.name, node);
    }

    return matched({ nodes: parentNodes.concat(node), token: lastToken });
  });
};

// Implementation A-z - char range
export const parseCharRange: NodeParser = (startToken, nodes, ctx, recursiveFn = parseCharRange) => {
  const fromNode = nodes.at(-1);
  if (!fromNode) {
    return unmatched({ nodes, token: startToken });
  }

  const nextStep = startToken.next();
  assertNullable(nextStep, ctx.reportError(startToken, commonErrorMessages.EOL));

  return recursiveFn(nextStep, [], ctx).matched(({ nodes: nextNodes, token }) => {
    const toNode = nextNodes.at(0);
    if (!toNode) {
      return unmatched({ nodes, token });
    }

    if (!isCharNode(fromNode)) {
      return errored(ctx.reportError(fromNode, commonErrorMessages.UnexpectedToken));
    }
    if (!isCharNode(toNode)) {
      return errored(ctx.reportError(toNode, commonErrorMessages.UnexpectedToken));
    }

    const fromCharCode = fromNode.value.charCodeAt(0);
    const toCharCode = toNode.value.charCodeAt(0);
    if (fromCharCode > toCharCode) {
      return errored(
        ctx.reportError(
          {
            start: fromNode.start,
            end: toNode.end,
          },
          `Character range is out of order: from '${fromNode.value}' (index ${fromCharCode}) to '${toNode.value}' (index ${toCharCode})`,
        ),
      );
    }

    nextNodes.shift();
    return matched({
      nodes: replace(nodes, fromNode, factory.createCharRangeNode(fromNode, toNode)).concat(nextNodes),
      token,
    });
  });
};

// Implementation [...] - char class
// Implementation [^...] - negative char class
export const parseCharClass: NodeParser = (firstToken, parentNodes, ctx) => {
  if (!isBracketsOpenToken(firstToken)) {
    return errored(ctx.reportError(firstToken, 'Trying to parse expression as character class, but got invalid input'));
  }

  // eslint-disable-next-line complexity
  const parseTokenInCharClass: NodeParser = (token, nodes, ctx) => {
    if (isBracketsCloseToken(token)) {
      return unmatched({ nodes, token });
    } else if (ctx.tokenizer.isLastToken(token)) {
      return errored(
        ctx.reportError(
          {
            start: firstToken.start,
            end: token.end,
          },
          'Character class missing closing bracket',
        ),
      );
    }

    switch (token.kind) {
      case TokenKind.SyntaxChar:
        return parseSimpleChar(token, nodes, ctx);

      case TokenKind.CharEscape:
        return matchFirst([() => parseBackspace(token, nodes, ctx), () => parseCharEscape(token, nodes, ctx)]);

      case TokenKind.CharClassEscape:
        return parseCharClassEscape(token, nodes, ctx);

      case TokenKind.ControlEscape:
        return parseControlEscapeHandler(token, nodes, ctx);

      case TokenKind.DecimalEscape:
        return matchFirst([() => parseOctalChar(token, nodes, ctx), () => parseEscapedChar(token, nodes, ctx)]);

      case TokenKind.Decimal:
        return parseSimpleChar(token, nodes, ctx);

      case TokenKind.PatternChar:
        switch (token.value) {
          case '-':
            return matchFirst([
              () => parseCharRange(token, nodes, ctx, parseTokenInCharClass),
              () => parseSimpleChar(token, nodes, ctx),
            ]);

          default:
            return parseSimpleChar(token, nodes, ctx);
        }
    }
  };

  return matchTokenSequence(firstToken, [
    [TokenKind.SyntaxChar, { value: '[' }],
    [TokenKind.SyntaxChar, { value: '^' }],
  ]).flatMap(negative => {
    const startingStep = negative.match ? negative.value.token.next() : firstToken.next();
    assertNullable(startingStep, ctx.reportError(firstToken, commonErrorMessages.EOL));

    return fillExpressions(startingStep, ctx, parseTokenInCharClass).matched(({ nodes, token: lastToken }) => {
      const charClassNode = factory.createCharClassNode(negative.match, nodes, {
        start: firstToken.start,
        end: lastToken.end,
      });
      return matched({ nodes: parentNodes.concat(charClassNode), token: lastToken });
    });
  });
};

export const parseCharEscape: NodeParser = (token, nodes, ctx) => {
  switch (token.value) {
    // Implementation \xYY - hex symbol code
    case 'x': {
      return matchFirst([() => parseHexChar(token, nodes, ctx), () => parseEscapedChar(token, nodes, ctx)]);
    }

    case 'u': {
      return matchFirst([() => parseUnicodeChar(token, nodes, ctx), () => parseEscapedChar(token, nodes, ctx)]);
    }

    case 'c': {
      return matchFirst([() => parseASCIIControlChar(token, nodes, ctx), () => parseEscapedChar(token, nodes, ctx)]);
    }

    default:
      break;
  }

  return unmatched({ nodes, token });
};

export const parseEscapedChar: NodeParser = (token, nodes) =>
  matched({ nodes: nodes.concat(factory.createCharNode(token.value, token, 'escaped')), token });

export const parseSimpleChar: NodeParser = (token, nodes) =>
  matched({ nodes: nodes.concat(factory.createCharNode(token.value, token, 'simple')), token });

export const parseCharClassEscape: NodeParser = (token, nodes) => {
  switch (token.value) {
    // Implementation \d - any digit
    case 'd':
      return matched({
        nodes: nodes.concat(factory.createSimpleNode<AnyDigitNode>(SyntaxKind.AnyDigit, token)),
        token,
      });
    // Implementation \D - any non digit
    case 'D':
      return matched({
        nodes: nodes.concat(factory.createSimpleNode<NonDigitNode>(SyntaxKind.NonDigit, token)),
        token,
      });
    // Implementation \s - any whitespace
    case 's':
      return matched({
        nodes: nodes.concat(factory.createSimpleNode<AnyWhitespaceNode>(SyntaxKind.AnyWhitespace, token)),
        token,
      });
    // Implementation \S - non whitespace
    case 'S':
      return matched({
        nodes: nodes.concat(factory.createSimpleNode<NonWhitespaceNode>(SyntaxKind.NonWhitespace, token)),
        token,
      });
    // Implementation \w - any word [a-zA-Z0-9_]
    case 'w':
      return matched({ nodes: nodes.concat(factory.createSimpleNode<AnyWordNode>(SyntaxKind.AnyWord, token)), token });
    // Implementation \w - any non word [^a-zA-Z0-9_]
    case 'W':
      return matched({ nodes: nodes.concat(factory.createSimpleNode<NonWordNode>(SyntaxKind.NonWord, token)), token });
  }

  return unmatched({ nodes, token });
};
export const parseControlEscapeHandler: NodeParser = (token, nodes, ctx) => {
  let type: ControlEscapeCharType;

  switch (token.value) {
    // Implementation \n - new line
    case 'n':
      type = ControlEscapeCharType.NewLine;
      break;
    // Implementation \r - carriage return
    case 'r':
      type = ControlEscapeCharType.CarriageReturn;
      break;
    // Implementation \t - tab
    case 't':
      type = ControlEscapeCharType.Tab;
      break;
    // Implementation \v - vertical whitespace
    case 'v':
      type = ControlEscapeCharType.VerticalWhitespace;
      break;
    // Implementation \f - form feed char
    case 'f':
      type = ControlEscapeCharType.FormFeedChar;
      break;
    default:
      return errored(ctx.reportError(token, `Unsupported Control escape character: \\${token.value}`));
  }

  return matched({ nodes: nodes.concat(factory.createControlEscapeNode(type, token)), token });
};

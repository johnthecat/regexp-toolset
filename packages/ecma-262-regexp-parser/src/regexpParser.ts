import type { RegexpTokenizer, Step } from './regexpTokenizer.js';
import {
  isBracketsCloseToken,
  isBracketsOpenToken,
  isEscapedCharToken,
  isForwardSlashToken,
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
  CharNode,
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
import {
  createRegexpNode,
  createSimpleNode,
  isAnyCharNode,
  isAnyDigitNode,
  isAnyWhitespaceNode,
  isAnyWordNode,
  isCharClassNode,
  isCharNode,
  isControlEscapeCharNode,
  isGroupNode,
  isNonDigitNode,
  isNonUnicodePropertyNode,
  isNonWhitespaceNode,
  isNonWordNode,
  isUnicodePropertyNode,
} from './regexpNodeFactory.js';
import type { NodeParser, NodeParserResultValue, ParserContext, SingleNodeParser } from './regexpParseTypes.js';
import {
  curlyBracketCloseMatcher,
  curlyBracketOpenMatcher,
  hexMatcher,
  matchTokenSequence,
  numberMatcher,
  octalMatcher,
  wordMatcher,
} from './regexpSequenceMatcher.js';
import { fillExpressions } from './regexpParseUtils.js';
import { remove, replace } from './common/array.js';
import * as match from './common/monads/match.js';
import { isNumber, nonNullable } from './common/typeCheckers.js';

const commonErrorMessages = {
  EOL: 'Unexpected end of line',
  UnexpectedToken: 'Unexpected token',
};

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

const connectSubpatternsWithGroups = (ctx: ParserContext): match.Match<void> => {
  for (const [tag, node] of ctx.groupSpecifierDemands) {
    const found = ctx.foundGroupSpecifiers.get(tag);
    if (!found) {
      return match.errored(ctx.reportError(node, `This token references a non-existent or invalid subpattern`));
    }
    node.ref = found;
  }

  return match.matched(void 0);
};

export const parseRegexp: SingleNodeParser<RegexpNode> = (firstToken, ctx) => {
  const firstContentToken = match.nonNullable(firstToken.next()).orError(() => ctx.reportError(0, "Can't parse input"));
  const collectedNodes = firstContentToken
    .matched(token => fillExpressions(token, ctx, parseNodeInRegexp))
    .filter(({ token: closingToken }) => isForwardSlashToken(closingToken))
    .orError(() => ctx.reportError(0, 'Regexp body should end with "/" symbol, like this: /.../gm'));

  const flags = collectedNodes
    .flatMap(({ token }) => match.nonNullable(token.next()))
    .map(token => parseFlags(token, ctx))
    .orElse(() => match.matched(''));

  return match.all(collectedNodes, flags).matched(([{ nodes }, flags]) => {
    const regexpNode = createRegexpNode(nodes, flags);
    return connectSubpatternsWithGroups(ctx).map(() => ({ node: regexpNode }));
  });
};

const supportedFlags = ['g', 'i', 'm', 's', 'u', 'y'];
const lowercaseRegexp = /[a-z]/;
const parseFlags = (step: Step, ctx: ParserContext): string => {
  let result = '';
  let currentStep = step;
  while (currentStep) {
    if (!isPatternCharToken(currentStep) || !lowercaseRegexp.test(currentStep.value)) {
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

// eslint-disable-next-line complexity
const isQuantifiable = (node: AnyRegexpNode) =>
  isCharNode(node) ||
  isCharClassNode(node) ||
  isGroupNode(node) ||
  isControlEscapeCharNode(node) ||
  isAnyCharNode(node) ||
  isAnyWordNode(node) ||
  isNonWordNode(node) ||
  isAnyDigitNode(node) ||
  isNonDigitNode(node) ||
  isAnyWhitespaceNode(node) ||
  isNonWhitespaceNode(node) ||
  isUnicodePropertyNode(node) ||
  isNonUnicodePropertyNode(node);

// Implementation .* ; .+ ; .? - quantifiers
export const parseQuantifier: NodeParser = ({ nodes, token }, ctx) => {
  const lazy = matchTokenSequence(token, [TokenKind.SyntaxChar, [TokenKind.SyntaxChar, { value: '?' }]]);
  const lastToken = lazy.map(x => x.token).orElse(() => match.matched(token));

  const quantifiableNode = match
    .nonNullable(nodes.at(-1))
    .orError(() => ctx.reportError(token, 'There is nothing to quantify'))
    .filter<AnyRegexpNode>(isQuantifiable)
    .orError(() => ctx.reportError(token, 'The preceding token is not quantifiable'));

  const quantifierNode = match.all(lazy.isMatched(), lastToken).map(([isLazy, lastToken]) => {
    const position = { start: token.start, end: lastToken.end };
    return factory.createQuantifierNode(position, {
      type:
        token.value === '?'
          ? QuantifierType.NoneOrSingle
          : token.value === '+'
          ? QuantifierType.SingleOrMany
          : QuantifierType.NoneOrMany,
      greedy: !isLazy,
    });
  });

  return match.all(quantifiableNode, quantifierNode, lastToken).map(([quantifiable, quantifier, lastToken]) => ({
    nodes: replace(nodes, quantifiable, factory.createRepetitionNode(quantifiable, quantifier)),
    token: lastToken,
  }));
};

// Implementation Y{1} ; Y{1,} ; Y{1,2} - range quantifier
export const parseRangeQuantifier: NodeParser = (x, ctx) => {
  const { nodes, token } = x;
  const quantifiableNode = match
    .nonNullable(nodes.at(-1))
    .orError(() => ctx.reportError(token, 'There is nothing to quantify'))
    .filter<AnyRegexpNode>(isQuantifiable)
    .orError(() => ctx.reportError(token, 'The preceding token is not quantifiable'));

  const trySequence = (
    { token, nodes }: NodeParserResultValue,
    seq: Parameters<typeof matchTokenSequence<number>>[1],
  ) => {
    const range = matchTokenSequence<number>(token, seq);
    const from = range
      .map(x => x.values.at(0))
      .filter<number>(isNumber)
      .orError(() => ctx.reportError(token, "Can't parse numeric values from range."));
    const to = range.map(x => x.values.at(1));

    const lazy = range.flatMap(({ token }) =>
      matchTokenSequence(token, [TokenKind.SyntaxChar, [TokenKind.SyntaxChar, { value: '?' }]]),
    );

    const lastToken = lazy.map(x => x.token).orElse(() => range.map(x => x.token));

    const quantifierNode = match.all(lazy.isMatched(), lastToken, from, to).flatMap(([isLazy, lastToken, from, to]) => {
      const position = { start: token.start, end: lastToken.end };

      if (typeof to === 'number' && from > to) {
        return match.errored(ctx.reportError(position, 'The quantifier range is out of order'));
      }
      return match.matched(
        factory.createQuantifierNode(position, {
          type: QuantifierType.Range,
          greedy: !isLazy,
          from,
          to,
        }),
      );
    });

    return match.all(quantifiableNode, quantifierNode, lastToken).map(([quantifiable, quantifier, token]) => ({
      nodes: replace(nodes, quantifiable, factory.createRepetitionNode(quantifiable, quantifier)),
      token,
    }));
  };

  return trySequence(x, [curlyBracketOpenMatcher, numberMatcher, curlyBracketCloseMatcher])
    .unmatched(() =>
      trySequence(x, [
        curlyBracketOpenMatcher,
        numberMatcher,
        [TokenKind.PatternChar, { value: ',' }, token => match.matched({ value: Number.POSITIVE_INFINITY, token })],
        curlyBracketCloseMatcher,
      ]),
    )
    .unmatched(() =>
      trySequence(x, [
        curlyBracketOpenMatcher,
        numberMatcher,
        [TokenKind.PatternChar, { value: ',' }],
        numberMatcher,
        curlyBracketCloseMatcher,
      ]),
    );
};

// Implementation \k<...> - subpattern match
export const parseSubpatternMatch: NodeParser = ({ token, nodes }, ctx) => {
  return matchTokenSequence(token, [
    [TokenKind.CharEscape, { value: 'k' }],
    [TokenKind.PatternChar, { value: '<' }],
    wordMatcher,
    [TokenKind.PatternChar, { value: '>' }],
  ]).matched(subpattern => {
    const groupName = subpattern.values.at(0);
    if (!groupName) {
      return match.errored(ctx.reportError(subpattern, `Can't parse subpattern name`));
    }
    const node: SubpatternNode = {
      kind: SyntaxKind.Subpattern,
      start: subpattern.start,
      end: subpattern.end,
      ref: null,
      groupName,
    };
    ctx.groupSpecifierDemands.add([groupName, node]);
    return match.matched({ nodes: nodes.concat(node), token: subpattern.token });
  });
};

// Implementation \0 - null char
export const parseNullChar: NodeParser = ({ token, nodes }) => {
  if (token.value === '0') {
    return match.matched({
      nodes: nodes.concat(factory.createSimpleNode<NullCharNode>(SyntaxKind.NullChar, token)),
      token,
    });
  }
  return match.unmatched();
};

// Implementation (...)\1 - back reference
export const parseBackReferenceChar: NodeParser = ({ token, nodes }) => {
  const groupNode = match.nonNullable(nodes.at(-1)).filter<GroupNode>(isGroupNode);
  const backReferenceToken = match.nonNullable(token).filter(x => x.value === '1');
  const backReferenceNode = match
    .all(groupNode, backReferenceToken)
    .map(([group, token]) => factory.createBackReferenceNode({ start: group.start, end: token.end }, group));

  return match.all(groupNode, backReferenceNode, backReferenceToken).map(([group, backReference, token]) => ({
    nodes: replace(nodes, group, backReference),
    token,
  }));
};

// Implementation [\b] - backspace
export const parseBackspace: NodeParser = ({ nodes, token }) =>
  match
    .nonNullable(token)
    .filter(x => isEscapedCharToken(x, 'b'))
    .map(token => ({
      nodes: nodes.concat(factory.createSimpleNode<BackspaceNode>(SyntaxKind.Backspace, token)),
      token,
    }));

// Implementation .|. - disjunction
export const parseDisjunction: NodeParser = (
  { token: separatorToken, nodes: leftNodes },
  ctx,
  recursiveFn = parseNodeInRegexp,
) => {
  const wrappedRecursiveParser = (y: NodeParserResultValue, ctx: ParserContext) => {
    // creating tail recursion for correct nesting of multiple disjunctions
    const hasSimpleBody = match.nonNullable(y.token).filter(t => !isSyntaxCharToken(t, '|'));
    return hasSimpleBody.matched(() => recursiveFn(y, ctx));
  };

  const rightNodesFirstToken = match.nonNullable(separatorToken.next()).filter<Step>(nonNullable);

  return match.first(
    () =>
      rightNodesFirstToken
        .matched(x => fillExpressions(x, ctx, wrappedRecursiveParser))
        .map(({ nodes: rightNodes, token }) => ({
          nodes: [factory.createDisjunctionNode(leftNodes, rightNodes, separatorToken)],
          token: token.prev(),
        })),

    () =>
      rightNodesFirstToken.unmatched(() =>
        match.matched({
          nodes: [factory.createDisjunctionNode(leftNodes, [], separatorToken)],
          token: separatorToken,
        }),
      ),
  );
};

// Implementation ^... - line start
export const parseLineStart: NodeParser = ({ nodes, token }) =>
  match.matched({
    nodes: nodes.concat(factory.createSimpleNode<LineStartNode>(SyntaxKind.LineStart, token)),
    token,
  });

// Implementation ...$ - line end
export const parseLineEnd: NodeParser = ({ nodes, token }) =>
  match.matched({
    nodes: nodes.concat(factory.createSimpleNode<LineEndNode>(SyntaxKind.LineEnd, token)),
    token,
  });

// Implementation . - any character
export const parseAnyChar: NodeParser = ({ nodes, token }) =>
  match.matched({
    nodes: nodes.concat(factory.createSimpleNode<AnyCharNode>(SyntaxKind.AnyChar, token)),
    token,
  });

// Implementation \uYYYY - unicode symbol code
export const parseUnicodeChar: NodeParser = ({ nodes, token }, ctx) =>
  matchTokenSequence(token, [[TokenKind.CharEscape, { value: 'u' }], hexMatcher, hexMatcher]).matched(unicode => {
    const value = unicode.values.join('');
    if (!value) {
      return match.errored(ctx.reportError(token, `Can't parse value as unicode number`));
    }

    return match.matched({
      nodes: nodes.concat(factory.createCharNode(String.fromCharCode(parseInt(value, 16)), unicode, 'unicode')),
      token: unicode.token,
    });
  });

// Implementation \xYY - hex symbol code
export const parseHexChar: NodeParser = ({ nodes, token }, ctx) =>
  matchTokenSequence(token, [[TokenKind.CharEscape, { value: 'x' }], hexMatcher]).matched(hex => {
    const value = hex.values.at(0);
    if (!value) {
      return match.errored(ctx.reportError(token, `Can't parse value as hex code`));
    }
    return match.matched({
      nodes: nodes.concat(factory.createCharNode(String.fromCharCode(parseInt(value, 16)), hex, 'hex')),
      token: hex.token,
    });
  });

// Implementation \ddd - octal char number
export const parseOctalChar: NodeParser = ({ nodes, token }, ctx) =>
  matchTokenSequence(token, [octalMatcher]).matched(octal => {
    const value = octal.values.at(0);
    if (!value) {
      return match.errored(ctx.reportError(token, "Can't parse octal value"));
    }

    return match.matched({
      nodes: nodes.concat(factory.createCharNode(String.fromCodePoint(parseInt(value, 8)), octal, 'octal')),
      token: octal.token,
    });
  });

// Implementation \cA - ASCII control char
export const parseASCIIControlChar: NodeParser = ({ token, nodes }, ctx) => {
  const nextToken = match.nonNullable(token.next()).filter(x => !isForwardSlashToken(x));
  const valueToken = nextToken
    .filter(({ value }) => /[A-Za-z]/.test(value))
    .orError(() =>
      ctx.reportError(
        {
          start: token.start,
          end: token.end + 1,
        },
        'Invalid control character',
      ),
    );

  return nextToken
    .flatMap(() => valueToken)
    .map(valueToken => {
      const node = factory.createASCIIControlCharNode(valueToken.value.toUpperCase(), {
        start: token.start,
        end: valueToken.end,
      });
      return { nodes: nodes.concat(node), token: valueToken };
    });
};

const parseUnicodeProperty: NodeParser = x => {
  const unicodePropertyWithValue = matchTokenSequence(x.token, [
    [TokenKind.CharEscape, { value: 'p' }],
    curlyBracketOpenMatcher,
    wordMatcher,
    [TokenKind.PatternChar, { value: '=' }],
    wordMatcher,
    curlyBracketCloseMatcher,
  ]);
  const unicodePropertyWithoutValue = matchTokenSequence(x.token, [
    [TokenKind.CharEscape, { value: 'p' }],
    curlyBracketOpenMatcher,
    wordMatcher,
    curlyBracketCloseMatcher,
  ]);

  const matchedConstruction = unicodePropertyWithValue.orElse(() => unicodePropertyWithoutValue);
  const position = matchedConstruction.map(y => ({ start: x.token.start, end: y.token.end }));
  const name = matchedConstruction.matched(({ values }) => match.nonNullable(values.at(0)));
  const value = matchedConstruction.map(({ values }) => values.at(1) ?? null);
  const unicodePropertyNode = match
    .all(name, value, position)
    .map(([name, value, position]) => factory.createUnicodePropertyNode(name, value, position));

  return match.all(unicodePropertyNode, matchedConstruction).map(([node, { token }]) => ({
    nodes: x.nodes.concat(node),
    token,
  }));
};

const parseNonUnicodeProperty: NodeParser = x => {
  const unicodePropertyWithValue = matchTokenSequence(x.token, [
    [TokenKind.CharEscape, { value: 'P' }],
    curlyBracketOpenMatcher,
    wordMatcher,
    [TokenKind.PatternChar, { value: '=' }],
    wordMatcher,
    curlyBracketCloseMatcher,
  ]);
  const unicodePropertyWithoutValue = matchTokenSequence(x.token, [
    [TokenKind.CharEscape, { value: 'P' }],
    curlyBracketOpenMatcher,
    wordMatcher,
    curlyBracketCloseMatcher,
  ]);

  const matchedConstruction = unicodePropertyWithValue.orElse(() => unicodePropertyWithoutValue);
  const position = matchedConstruction.map(y => ({ start: x.token.start, end: y.token.end }));
  const name = matchedConstruction.matched(({ values }) => match.nonNullable(values.at(0)));
  const value = matchedConstruction.map(({ values }) => values.at(1) ?? null);
  const unicodePropertyNode = match
    .all(name, value, position)
    .map(([name, value, position]) => factory.createNonUnicodePropertyNode(name, value, position));

  return match.all(unicodePropertyNode, matchedConstruction).map(([node, { token }]) => ({
    nodes: x.nodes.concat(node),
    token,
  }));
};

// eslint-disable-next-line complexity
export const parseNodeInRegexp: NodeParser = (x, ctx, recursiveFn = parseNodeInRegexp) => {
  const { token, nodes } = x;
  switch (token.kind) {
    case TokenKind.CharClassEscape:
      return parseCharClassEscape(x, ctx);

    case TokenKind.ControlEscape:
      return parseControlEscapeHandler(x, ctx);

    case TokenKind.CharEscape:
      switch (token.value) {
        case 'b':
          return match.matched({
            nodes: nodes.concat(createSimpleNode<WordBoundaryNode>(SyntaxKind.WordBoundary, token)),
            token,
          });
        case 'B':
          return match.matched({
            nodes: nodes.concat(createSimpleNode<NonWordBoundaryNode>(SyntaxKind.NonWordBoundary, token)),
            token,
          });
        case 'p':
          return match.first(
            () => parseUnicodeProperty(x, ctx),
            () => parseEscapedChar(x, ctx),
          );
        case 'P':
          return match.first(
            () => parseNonUnicodeProperty(x, ctx),
            () => parseEscapedChar(x, ctx),
          );
        case 'k':
          return match.first(
            () => parseSubpatternMatch(x, ctx),
            () => parseEscapedChar(x, ctx),
          );
        default:
          return match.first(
            () => parseCharEscape(x, ctx),
            () => parseEscapedChar(x, ctx),
          );
      }

    case TokenKind.DecimalEscape:
      return match.first(
        () => parseOctalChar(x, ctx),
        () => parseNullChar(x, ctx),
        () => parseBackReferenceChar(x, ctx),
        () => parseEscapedChar(x, ctx),
      );

    case TokenKind.PatternChar:
      switch (token.value) {
        case '/':
          // End of regexp body
          return match.unmatched();

        default:
          return parseSimpleChar(x, ctx);
      }

    case TokenKind.Decimal:
      return parseSimpleChar(x, ctx);

    case TokenKind.SyntaxChar:
      switch (token.value) {
        case '[':
          return parseCharClass(x, ctx);

        case '{':
          return match.first(
            () => parseRangeQuantifier(x, ctx),
            () => parseSimpleChar(x, ctx),
          );

        case '(':
          return parseGroup(x, ctx);

        case '^':
          return parseLineStart(x, ctx);

        case '$':
          return parseLineEnd(x, ctx);

        case '.':
          return parseAnyChar(x, ctx);

        case '*':
        case '+':
        case '?':
          return parseQuantifier(x, ctx);

        case '|':
          return parseDisjunction(x, ctx, recursiveFn);

        case '}':
          return parseSimpleChar(x, ctx);

        case ')':
          return match.errored(ctx.reportError(token, 'Unmatched parenthesis'));

        default:
          return match.errored(ctx.reportError(token, commonErrorMessages.UnexpectedToken));
      }
  }
};

// Implementation (...) - capturing group
// eslint-disable-next-line complexity
export const parseGroup: NodeParser = ({ token: firstToken, nodes: parentNodes }, ctx) => {
  const parseNodeInGroup: NodeParser = (x, ctx) => {
    const { token } = x;
    if (isParenthesesOpenToken(token)) {
      return parseGroup(x, ctx);
    }

    // Closing group
    if (isParenthesesCloseToken(token)) {
      return match.unmatched();
    }

    if (isForwardSlashToken(token) || ctx.tokenizer.isLastToken(token)) {
      return match.errored(ctx.reportError({ start: firstToken.start, end: token.end }, 'Incomplete group structure'));
    }

    return parseNodeInRegexp(x, ctx, parseNodeInGroup);
  };

  const firstTokenMatch = match
    .nonNullable(firstToken)
    .filter(isParenthesesOpenToken)
    .orError(() => ctx.reportError(firstToken, 'Trying to parse expression as group, but got invalid input'));

  const groupMeta = match.first<{ token: Step; specifier: GroupNameNode | null; type: GroupNode['type'] }>(
    // Implementation (?=...) - positive lookahead
    () =>
      firstTokenMatch
        .flatMap(firstToken =>
          matchTokenSequence(firstToken, [
            [TokenKind.SyntaxChar, { value: '(' }],
            [TokenKind.SyntaxChar, { value: '?' }],
            [TokenKind.PatternChar, { value: '=' }],
          ]),
        )
        .map(({ token }) => ({ token, type: 'positiveLookahead', specifier: null } as const)),

    // Implementation (?!...) - negative lookahead
    () =>
      firstTokenMatch
        .flatMap(firstToken =>
          matchTokenSequence(firstToken, [
            [TokenKind.SyntaxChar, { value: '(' }],
            [TokenKind.SyntaxChar, { value: '?' }],
            [TokenKind.PatternChar, { value: '!' }],
          ]),
        )
        .map(({ token }) => ({ token, type: 'negativeLookahead', specifier: null } as const)),

    // Implementation (?<=...) - positive lookbehind
    () =>
      firstTokenMatch
        .flatMap(firstToken =>
          matchTokenSequence(firstToken, [
            [TokenKind.SyntaxChar, { value: '(' }],
            [TokenKind.SyntaxChar, { value: '?' }],
            [TokenKind.PatternChar, { value: '<' }],
            [TokenKind.PatternChar, { value: '=' }],
          ]),
        )
        .map(({ token }) => ({ token, type: 'positiveLookbehind', specifier: null } as const)),

    // Implementation (?<!...) - negative lookbehind
    () =>
      firstTokenMatch
        .flatMap(firstToken =>
          matchTokenSequence(firstToken, [
            [TokenKind.SyntaxChar, { value: '(' }],
            [TokenKind.SyntaxChar, { value: '?' }],
            [TokenKind.PatternChar, { value: '<' }],
            [TokenKind.PatternChar, { value: '!' }],
          ]),
        )
        .map(({ token }) => ({ token, type: 'negativeLookbehind', specifier: null } as const)),

    // Implementation (?:...) - non-capturing group
    () =>
      firstTokenMatch
        .flatMap(firstToken =>
          matchTokenSequence(firstToken, [
            [TokenKind.SyntaxChar, { value: '(' }],
            [TokenKind.SyntaxChar, { value: '?' }],
            [TokenKind.PatternChar, { value: ':' }],
          ]),
        )
        .map(({ token }) => ({ token, type: 'nonCapturing', specifier: null } as const)),

    // Implementation (?<tag_name>...) - named capturing group
    () =>
      firstTokenMatch
        .flatMap(firstToken =>
          matchTokenSequence<string>(firstToken, [
            [TokenKind.SyntaxChar, { value: '(' }],
            [TokenKind.SyntaxChar, { value: '?' }],
            [TokenKind.PatternChar, { value: '<' }],
            wordMatcher,
            [TokenKind.PatternChar, { value: '>' }],
          ]),
        )
        .flatMap(groupName => {
          const name = groupName.values.at(0);
          if (!name) {
            return match.errored(ctx.reportError(groupName.token, "Can't parse group name"));
          }
          if (ctx.foundGroupSpecifiers.has(name)) {
            return match.errored(ctx.reportError(groupName.token, `Group name '${name}' is already defined`));
          }

          const specifier = factory.createGroupNameNode(name, { start: groupName.start + 2, end: groupName.end });
          return match.matched({ token: groupName.token, type: 'capturing', specifier } as const);
        }),

    () => firstTokenMatch.map(token => ({ token, type: 'capturing', specifier: null })),
  );

  const collectedNodes = groupMeta
    .map(({ token }) => token.next())
    .filter<Step>(nonNullable)
    .orError(() => ctx.reportError(firstToken, commonErrorMessages.EOL))
    .flatMap(startStep => fillExpressions(startStep, ctx, parseNodeInGroup));

  return match
    .all(firstTokenMatch, groupMeta, collectedNodes)
    .flatMap(([firstToken, { type, specifier }, { nodes, token: lastToken }]) => {
      const node = factory.createGroupNode(type, specifier, nodes, {
        start: firstToken.start,
        end: lastToken.end,
      });

      if (specifier) {
        ctx.foundGroupSpecifiers.set(specifier.name, node);
      }

      return match.matched({ nodes: parentNodes.concat(node), token: lastToken });
    });
};

// Implementation A-z - char range
export const parseCharRange: NodeParser = ({ token: startToken, nodes }, ctx, recursiveFn = parseCharRange) => {
  const fromNode = match.nonNullable(nodes.at(-1)).filter<CharNode>(isCharNode);

  const nextNodes = match
    .nonNullable(startToken.next())
    .orError(() => ctx.reportError(startToken, commonErrorMessages.EOL))
    .flatMap(nextToken => recursiveFn({ token: nextToken, nodes: [] }, ctx));

  const toNode = nextNodes
    .map(({ nodes }) => nodes.at(0))
    .filter<AnyRegexpNode>(nonNullable)
    .filter<CharNode>(isCharNode)
    .orError(() => ctx.reportError(0, commonErrorMessages.UnexpectedToken));

  const rangeNode = match.all(fromNode, toNode).flatMap(([from, to]) => {
    const fromCharCode = from.value.charCodeAt(0);
    const toCharCode = to.value.charCodeAt(0);
    if (fromCharCode > toCharCode) {
      return match.errored(
        ctx.reportError(
          { start: from.start, end: to.end },
          `Character range is out of order: from '${from.value}' (index ${fromCharCode}) to '${to.value}' (index ${toCharCode})`,
        ),
      );
    }
    return match.matched(factory.createCharRangeNode(from, to));
  });

  return match.all(nextNodes, fromNode, toNode, rangeNode).map(([next, from, to, range]) => {
    return {
      nodes: replace(nodes, from, range).concat(remove(next.nodes, to)),
      token: next.token,
    };
  });
};

// Implementation [...] - char class
// Implementation [^...] - negative char class
export const parseCharClass: NodeParser = ({ token: firstToken, nodes: parentNodes }, ctx) => {
  const parseTokenInCharClass: NodeParser = (x, ctx) => {
    const { token } = x;

    if (isBracketsCloseToken(token)) {
      return match.unmatched();
    }

    if (ctx.tokenizer.isLastToken(token)) {
      return match.errored(
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
        return parseSimpleChar(x, ctx);

      case TokenKind.CharEscape:
        return match.first(
          () => parseBackspace(x, ctx),
          () => parseCharEscape(x, ctx),
          () => parseEscapedChar(x, ctx),
        );

      case TokenKind.CharClassEscape:
        return parseCharClassEscape(x, ctx);

      case TokenKind.ControlEscape:
        return parseControlEscapeHandler(x, ctx);

      case TokenKind.DecimalEscape:
        return match.first(
          () => parseOctalChar(x, ctx),
          () => parseEscapedChar(x, ctx),
        );

      case TokenKind.Decimal:
        return parseSimpleChar(x, ctx);

      case TokenKind.PatternChar:
        switch (token.value) {
          case '-':
            return match.first(
              () => parseCharRange(x, ctx, parseTokenInCharClass),
              () => parseSimpleChar(x, ctx),
            );

          default:
            return parseSimpleChar(x, ctx);
        }
    }
  };

  const firstTokenMatch = match
    .nonNullable(firstToken)
    .filter(isBracketsOpenToken)
    .orError(() => ctx.reportError(firstToken, 'Trying to parse expression as character class, but got invalid input'));

  const negative = firstTokenMatch.flatMap(firstToken =>
    matchTokenSequence(firstToken, [
      [TokenKind.SyntaxChar, { value: '[' }],
      [TokenKind.SyntaxChar, { value: '^' }],
    ]),
  );

  const startingStep = negative
    .map(x => x.token.next())
    .orElse(() => firstTokenMatch.map(x => x.next()))
    .filter<Step>(nonNullable)
    .orError(() => ctx.reportError(firstToken, commonErrorMessages.EOL));

  const foundNodes = startingStep.flatMap(x => fillExpressions(x, ctx, parseTokenInCharClass));

  return match
    .all(foundNodes, negative.isMatched(), firstTokenMatch)
    .map(([{ token: lastToken, nodes }, isNegative, firstToken]) => {
      const charClassNode = factory.createCharClassNode(isNegative, nodes, {
        start: firstToken.start,
        end: lastToken.end,
      });
      return { nodes: parentNodes.concat(charClassNode), token: lastToken };
    });
};

export const parseCharEscape: NodeParser = (x, ctx) => {
  switch (x.token.value) {
    // Implementation \xYY - hex symbol code
    case 'x': {
      return match.first(
        () => parseHexChar(x, ctx),
        () => parseEscapedChar(x, ctx),
      );
    }

    case 'u': {
      return match.first(
        () => parseUnicodeChar(x, ctx),
        () => parseEscapedChar(x, ctx),
      );
    }

    case 'c': {
      return match.first(
        () => parseASCIIControlChar(x, ctx),
        () => parseEscapedChar(x, ctx),
      );
    }

    default:
      break;
  }

  return match.unmatched();
};

export const parseEscapedChar: NodeParser = ({ token, nodes }) =>
  match.matched({ nodes: nodes.concat(factory.createCharNode(token.value, token, 'escaped')), token });

export const parseSimpleChar: NodeParser = ({ token, nodes }) =>
  match.matched({ nodes: nodes.concat(factory.createCharNode(token.value, token, 'simple')), token });

export const parseCharClassEscape: NodeParser = ({ token, nodes }) => {
  switch (token.value) {
    // Implementation \d - any digit
    case 'd':
      return match.matched({
        nodes: nodes.concat(factory.createSimpleNode<AnyDigitNode>(SyntaxKind.AnyDigit, token)),
        token,
      });
    // Implementation \D - any non digit
    case 'D':
      return match.matched({
        nodes: nodes.concat(factory.createSimpleNode<NonDigitNode>(SyntaxKind.NonDigit, token)),
        token,
      });
    // Implementation \s - any whitespace
    case 's':
      return match.matched({
        nodes: nodes.concat(factory.createSimpleNode<AnyWhitespaceNode>(SyntaxKind.AnyWhitespace, token)),
        token,
      });
    // Implementation \S - non whitespace
    case 'S':
      return match.matched({
        nodes: nodes.concat(factory.createSimpleNode<NonWhitespaceNode>(SyntaxKind.NonWhitespace, token)),
        token,
      });
    // Implementation \w - any word [a-zA-Z0-9_]
    case 'w':
      return match.matched({
        nodes: nodes.concat(factory.createSimpleNode<AnyWordNode>(SyntaxKind.AnyWord, token)),
        token,
      });
    // Implementation \w - any non word [^a-zA-Z0-9_]
    case 'W':
      return match.matched({
        nodes: nodes.concat(factory.createSimpleNode<NonWordNode>(SyntaxKind.NonWord, token)),
        token,
      });
  }

  return match.unmatched();
};
export const parseControlEscapeHandler: NodeParser = ({ token, nodes }, ctx) => {
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
      return match.errored(ctx.reportError(token, `Unsupported Control escape character: \\${token.value}`));
  }

  return match.matched({ nodes: nodes.concat(factory.createControlEscapeNode(type, token)), token });
};

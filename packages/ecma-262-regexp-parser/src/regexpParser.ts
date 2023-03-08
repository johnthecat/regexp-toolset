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
  WordBoundaryNode,
} from './regexpNodes.js';
import { ControlEscapeCharType, QuantifierType, SyntaxKind } from './regexpNodes.js';
import * as factory from './regexpNodeFactory.js';
import {
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
  chevronsCloseMatcher,
  chevronsOpenMatcher,
  curlyBracketCloseMatcher,
  curlyBracketOpenMatcher,
  equalsMatcher,
  hexMatcher,
  matchTokenSequence,
  numberMatcher,
  octalMatcher,
  parenthesisOpenMatcher,
  questionMarkMatcher,
  wordMatcher,
} from './regexpSequenceMatcher.js';
import { fillExpressions } from './regexpParseUtils.js';
import { remove, replace } from './common/array.js';
import * as match from './common/match/match.js';
import { isNumber } from './common/typeCheckers.js';

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

const createSimpleParser =
  (fn: (token: Step) => AnyRegexpNode) =>
  ({ nodes, token }: NodeParserResultValue) =>
    match.ok(createParserResult(nodes.concat(fn(token)), token));

const getToken = (x: { token: Step }) => x.token;
const getNodes = (x: { nodes: AnyRegexpNode[] }) => x.nodes;

const pipe2 = <F1 extends (...args: any[]) => any, F2 extends (arg: ReturnType<F1>) => any>(
  f1: F1,
  f2: F2,
): ((...args: Parameters<F1>) => ReturnType<F2>) => {
  return (...args) => f2(f1(...args));
};

const positionRange = (t1: NodePosition, t2: NodePosition): NodePosition => ({ start: t1.start, end: t2.end });

const connectSubpatternsWithGroups = (ctx: ParserContext): match.Match<void> => {
  for (const [tag, node] of ctx.groupSpecifierDemands) {
    const found = ctx.foundGroupSpecifiers.get(tag);
    if (!found) {
      return match.err(ctx.reportError(node, `This token references a non-existent or invalid subpattern`));
    }
    node.ref = found;
  }

  return match.ok(void 0);
};

export const parseRegexp: SingleNodeParser<RegexpNode> = (firstToken, ctx) => {
  const firstContentToken = matchNextToken(firstToken).orError(() => ctx.reportError(0, "Can't parse input"));
  const body = firstContentToken
    .matched(token => fillExpressions(token, ctx, parseNodeInRegexp))
    .filter(pipe2(getToken, isForwardSlashToken))
    .orError(() => ctx.reportError(0, 'Regexp body should end with "/" symbol, like this: /.../gm'));

  const flags = body
    .matched(pipe2(getToken, matchNextToken))
    .matched(token => parseFlags(token, ctx))
    .orElse(() => match.ok(''));

  return connectSubpatternsWithGroups(ctx)
    .matched(() => match.all(body.map(getNodes), flags))
    .map(([body, flags]) => ({ node: factory.createRegexpNode(body, flags) }));
};

const supportedFlags = ['g', 'i', 'm', 's', 'u', 'y'];
const lowercaseRegexp = /[a-z]/;
const parseFlags = (step: Step, ctx: ParserContext): match.Match<string> => {
  let result = '';
  for (const currentStep of ctx.tokenizer.iterate(step)) {
    if (!isPatternCharToken(currentStep) || !lowercaseRegexp.test(currentStep.value)) {
      return match.err(ctx.reportError(currentStep, commonErrorMessages.UnexpectedToken));
    }
    if (!supportedFlags.includes(currentStep.value)) {
      return match.err(ctx.reportError(currentStep, `Unknown flag '${currentStep.value}'`));
    }
    result += currentStep.value;
  }
  return match.ok(result);
};

const matchNextToken = (token: Step): match.Match<Step> => match.nonNullable(token.next());
const matchFirstNode = (nodes: AnyRegexpNode[]) => match.nonNullable(nodes.at(0));
const matchLastNode = (nodes: AnyRegexpNode[]) => match.nonNullable(nodes.at(-1));

const createParserResult = (nodes: AnyRegexpNode[], token: Step): NodeParserResultValue => ({ nodes, token });

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
  const lazy = matchTokenSequence(token, [TokenKind.SyntaxChar, questionMarkMatcher]);
  const lastToken = lazy.map(getToken).orElse(() => match.ok(token));

  const quantifiableNode = matchLastNode(nodes)
    .orError(() => ctx.reportError(token, 'There is nothing to quantify'))
    .filter(isQuantifiable)
    .orError(() => ctx.reportError(token, 'The preceding token is not quantifiable'));

  const quantifierNode = match.all(lazy.isMatched(), lastToken).map(([isLazy, lastToken]) => {
    return factory.createQuantifierNode(positionRange(token, lastToken), {
      type:
        token.value === '?'
          ? QuantifierType.NoneOrSingle
          : token.value === '+'
          ? QuantifierType.SingleOrMany
          : QuantifierType.NoneOrMany,
      greedy: !isLazy,
    });
  });

  return match
    .all(quantifiableNode, quantifierNode, lastToken)
    .map(([quantifiable, quantifier, lastToken]) =>
      createParserResult(
        replace(nodes, quantifiable, factory.createRepetitionNode(quantifiable, quantifier)),
        lastToken,
      ),
    );
};

// Implementation Y{1} ; Y{1,} ; Y{1,2} - range quantifier
export const parseRangeQuantifier: NodeParser = (x, ctx) => {
  const { nodes, token } = x;
  const quantifiableNode = matchLastNode(nodes)
    .orError(() => ctx.reportError(token, 'There is nothing to quantify'))
    .filter(isQuantifiable)
    .orError(() => ctx.reportError(token, 'The preceding token is not quantifiable'));

  const trySequence = (
    { token, nodes }: NodeParserResultValue,
    seq: Parameters<typeof matchTokenSequence<number>>[1],
  ) => {
    const range = matchTokenSequence<number>(token, seq);
    const from = range
      .map(x => x.values.at(0))
      .filter(isNumber)
      .orError(() => ctx.reportError(token, "Can't parse numeric values from range."));
    const to = range.map(x => x.values.at(1));

    const lazy = range.matched(x => matchTokenSequence(getToken(x), [TokenKind.SyntaxChar, questionMarkMatcher]));
    const lastToken = lazy.map(getToken).orElse(() => range.map(getToken));

    const quantifierNode = match.all(lazy.isMatched(), lastToken, from, to).matched(([isLazy, lastToken, from, to]) => {
      const position = positionRange(token, lastToken);

      if (typeof to === 'number' && from > to) {
        return match.err(ctx.reportError(position, 'The quantifier range is out of order'));
      }
      return match.ok(
        factory.createQuantifierNode(position, {
          type: QuantifierType.Range,
          greedy: !isLazy,
          from,
          to,
        }),
      );
    });

    return match
      .all(quantifiableNode, quantifierNode, lastToken)
      .map(([quantifiable, quantifier, token]) =>
        createParserResult(replace(nodes, quantifiable, factory.createRepetitionNode(quantifiable, quantifier)), token),
      );
  };

  return trySequence(x, [curlyBracketOpenMatcher, numberMatcher, curlyBracketCloseMatcher])
    .unmatched(() =>
      trySequence(x, [
        curlyBracketOpenMatcher,
        numberMatcher,
        [TokenKind.PatternChar, { value: ',' }, token => match.ok({ value: Number.POSITIVE_INFINITY, token })],
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
  const subpattern = matchTokenSequence(token, [
    [TokenKind.CharEscape, { value: 'k' }],
    chevronsOpenMatcher,
    wordMatcher,
    chevronsCloseMatcher,
  ]);

  return subpattern.matched(subpattern => {
    const groupName = subpattern.values.at(0);
    if (!groupName) {
      return match.err(ctx.reportError(subpattern, `Can't parse subpattern name`));
    }
    const node = factory.createSubpatternNode(groupName, null, subpattern);
    ctx.groupSpecifierDemands.add([groupName, node]);
    return match.ok(createParserResult(nodes.concat(node), subpattern.token));
  });
};

// Implementation \0 - null char
export const parseNullChar: NodeParser = x => {
  if (getToken(x).value === '0') {
    return createSimpleParser(token => factory.createSimpleNode<NullCharNode>(SyntaxKind.NullChar, token))(x);
  }
  return match.none();
};

// Implementation (...)\1 - back reference
export const parseBackReferenceChar: NodeParser = ({ token, nodes }) => {
  const groupNode = matchLastNode(nodes).filter(isGroupNode);
  const backReferenceToken = match.ok(token).filter(x => x.value === '1');
  const backReferenceNode = match
    .all(groupNode, backReferenceToken)
    .map(([group, token]) => factory.createBackReferenceNode(positionRange(group, token), group));

  return match
    .all(groupNode, backReferenceNode, backReferenceToken)
    .map(([group, backReference, token]) => createParserResult(replace(nodes, group, backReference), token));
};

// Implementation [\b] - backspace
export const parseBackspace: NodeParser = x =>
  match
    .ok(x)
    .filter(x => isEscapedCharToken(getToken(x), 'b'))
    .matched(createSimpleParser(token => factory.createSimpleNode<BackspaceNode>(SyntaxKind.Backspace, token)));

// Implementation .|. - disjunction
export const parseDisjunction: NodeParser = (
  { token: separatorToken, nodes: leftNodes },
  ctx,
  recursiveFn = parseNodeInRegexp,
) => {
  const wrappedRecursiveParser = (y: NodeParserResultValue, ctx: ParserContext) => {
    // creating tail recursion for correct nesting of multiple disjunctions
    const hasSimpleBody = match.ok(y).filter(x => !isSyntaxCharToken(getToken(x), '|'));
    return hasSimpleBody.matched(x => recursiveFn(x, ctx));
  };
  const rightNodesFirstToken = matchNextToken(separatorToken);

  return match.first(
    () =>
      rightNodesFirstToken
        .matched(x => fillExpressions(x, ctx, wrappedRecursiveParser))
        .map(({ nodes: rightNodes, token }) =>
          createParserResult([factory.createDisjunctionNode(leftNodes, rightNodes, separatorToken)], token.prev()),
        ),

    () =>
      rightNodesFirstToken.unmatched(() =>
        match.ok(createParserResult([factory.createDisjunctionNode(leftNodes, [], separatorToken)], separatorToken)),
      ),
  );
};

// Implementation ^... - line start
export const parseLineStart: NodeParser = createSimpleParser(token =>
  factory.createSimpleNode<LineStartNode>(SyntaxKind.LineStart, token),
);

// Implementation ...$ - line end
export const parseLineEnd: NodeParser = createSimpleParser(token =>
  factory.createSimpleNode<LineEndNode>(SyntaxKind.LineEnd, token),
);

// Implementation . - any character
export const parseAnyChar: NodeParser = createSimpleParser(token =>
  factory.createSimpleNode<AnyCharNode>(SyntaxKind.AnyChar, token),
);

// Implementation \uYYYY - unicode symbol code
export const parseUnicodeChar: NodeParser = ({ nodes, token }, ctx) =>
  matchTokenSequence(token, [[TokenKind.CharEscape, { value: 'u' }], hexMatcher, hexMatcher]).matched(unicode => {
    const value = unicode.values.join('');
    if (!value) {
      return match.err(ctx.reportError(token, `Can't parse value as unicode number`));
    }

    return match.ok(
      createParserResult(
        nodes.concat(factory.createCharNode(String.fromCharCode(parseInt(value, 16)), unicode, 'unicode')),
        unicode.token,
      ),
    );
  });

// Implementation \xYY - hex symbol code
export const parseHexChar: NodeParser = ({ nodes, token }, ctx) =>
  matchTokenSequence(token, [[TokenKind.CharEscape, { value: 'x' }], hexMatcher]).matched(hex => {
    const value = hex.values.at(0);
    if (!value) {
      return match.err(ctx.reportError(token, `Can't parse value as hex code`));
    }
    return match.ok(
      createParserResult(
        nodes.concat(factory.createCharNode(String.fromCharCode(parseInt(value, 16)), hex, 'hex')),
        hex.token,
      ),
    );
  });

// Implementation \ddd - octal char number
export const parseOctalChar: NodeParser = ({ nodes, token }, ctx) =>
  matchTokenSequence(token, [octalMatcher]).matched(octal => {
    const value = octal.values.at(0);
    if (!value) {
      return match.err(ctx.reportError(token, "Can't parse octal value"));
    }

    return match.ok(
      createParserResult(
        nodes.concat(factory.createCharNode(String.fromCodePoint(parseInt(value, 8)), octal, 'octal')),
        octal.token,
      ),
    );
  });

// Implementation \cA - ASCII control char
export const parseASCIIControlChar: NodeParser = ({ token, nodes }, ctx) => {
  const possibleValueToken = matchNextToken(token).filter(x => !isForwardSlashToken(x));
  const valueToken = possibleValueToken
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

  return possibleValueToken
    .matched(() => valueToken)
    .map(valueToken => {
      const node = factory.createASCIIControlCharNode(valueToken.value, positionRange(token, valueToken));
      return createParserResult(nodes.concat(node), valueToken);
    });
};

const parseUnicodeProperty: NodeParser = x => {
  const unicodePropertyWithValue = matchTokenSequence(x.token, [
    [TokenKind.CharEscape, { value: 'p' }],
    curlyBracketOpenMatcher,
    wordMatcher,
    equalsMatcher,
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
  const position = matchedConstruction.map(y => positionRange(x.token, y.token));
  const name = matchedConstruction.matched(({ values }) => match.nonNullable(values.at(0)));
  const value = matchedConstruction.map(({ values }) => values.at(1) ?? null);
  const unicodePropertyNode = match
    .all(name, value, position)
    .map(([name, value, position]) => factory.createUnicodePropertyNode(name, value, position));

  return match
    .all(unicodePropertyNode, matchedConstruction.map(getToken))
    .map(([node, token]) => createParserResult(x.nodes.concat(node), token));
};

const parseNonUnicodeProperty: NodeParser = x => {
  const unicodePropertyWithValue = matchTokenSequence(x.token, [
    [TokenKind.CharEscape, { value: 'P' }],
    curlyBracketOpenMatcher,
    wordMatcher,
    equalsMatcher,
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
  const position = matchedConstruction.map(y => positionRange(x.token, y.token));
  const name = matchedConstruction.matched(({ values }) => match.nonNullable(values.at(0)));
  const value = matchedConstruction.map(({ values }) => values.at(1) ?? null);
  const unicodePropertyNode = match
    .all(name, value, position)
    .map(([name, value, position]) => factory.createNonUnicodePropertyNode(name, value, position));

  return match
    .all(unicodePropertyNode, matchedConstruction.map(getToken))
    .map(([node, token]) => createParserResult(x.nodes.concat(node), token));
};

// eslint-disable-next-line complexity
export const parseNodeInRegexp: NodeParser = (x, ctx, recursiveFn = parseNodeInRegexp) => {
  const token = getToken(x);
  switch (token.kind) {
    case TokenKind.CharClassEscape:
      return parseCharClassEscape(x, ctx);

    case TokenKind.ControlEscape:
      return parseControlEscapeHandler(x, ctx);

    case TokenKind.CharEscape:
      switch (token.value) {
        case 'b':
          return createSimpleParser(token =>
            factory.createSimpleNode<WordBoundaryNode>(SyntaxKind.WordBoundary, token),
          )(x);
        case 'B':
          return createSimpleParser(token =>
            factory.createSimpleNode<NonWordBoundaryNode>(SyntaxKind.NonWordBoundary, token),
          )(x);
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
          return match.none();

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
          return match.err(ctx.reportError(token, 'Unmatched parenthesis'));

        default:
          return match.err(ctx.reportError(token, commonErrorMessages.UnexpectedToken));
      }
  }
};

// Implementation (...) - capturing group
// eslint-disable-next-line complexity
export const parseGroup: NodeParser = ({ token: inputToken, nodes: parentNodes }, ctx) => {
  const parseNodeInGroup: NodeParser = (x, ctx) => {
    const token = getToken(x);
    // Closing group
    if (isParenthesesCloseToken(token)) {
      return match.none();
    }

    if (isForwardSlashToken(token) || ctx.tokenizer.isLastToken(token)) {
      return match.err(ctx.reportError(positionRange(inputToken, token), 'Incomplete group structure'));
    }

    return parseNodeInRegexp(x, ctx, parseNodeInGroup);
  };

  const firstToken = match
    .ok(inputToken)
    .filter(isParenthesesOpenToken)
    .orError(() => ctx.reportError(inputToken, 'Trying to parse expression as group, but got invalid input'));

  const groupMeta = match.first<{ token: Step; specifier: GroupNameNode | null; type: GroupNode['type'] }>(
    // Implementation (?=...) - positive lookahead
    () =>
      firstToken
        .matched(firstToken =>
          matchTokenSequence(firstToken, [parenthesisOpenMatcher, questionMarkMatcher, equalsMatcher]),
        )
        .map(({ token }) => ({ token, type: 'positiveLookahead', specifier: null } as const)),

    // Implementation (?!...) - negative lookahead
    () =>
      firstToken
        .matched(firstToken =>
          matchTokenSequence(firstToken, [
            parenthesisOpenMatcher,
            questionMarkMatcher,
            [TokenKind.PatternChar, { value: '!' }],
          ]),
        )
        .map(({ token }) => ({ token, type: 'negativeLookahead', specifier: null } as const)),

    // Implementation (?<=...) - positive lookbehind
    () =>
      firstToken
        .matched(firstToken =>
          matchTokenSequence(firstToken, [
            parenthesisOpenMatcher,
            questionMarkMatcher,
            chevronsOpenMatcher,
            equalsMatcher,
          ]),
        )
        .map(({ token }) => ({ token, type: 'positiveLookbehind', specifier: null } as const)),

    // Implementation (?<!...) - negative lookbehind
    () =>
      firstToken
        .matched(firstToken =>
          matchTokenSequence(firstToken, [
            parenthesisOpenMatcher,
            questionMarkMatcher,
            chevronsOpenMatcher,
            [TokenKind.PatternChar, { value: '!' }],
          ]),
        )
        .map(({ token }) => ({ token, type: 'negativeLookbehind', specifier: null } as const)),

    // Implementation (?:...) - non-capturing group
    () =>
      firstToken
        .matched(firstToken =>
          matchTokenSequence(firstToken, [
            parenthesisOpenMatcher,
            questionMarkMatcher,
            [TokenKind.PatternChar, { value: ':' }],
          ]),
        )
        .map(({ token }) => ({ token, type: 'nonCapturing', specifier: null } as const)),

    // Implementation (?<tag_name>...) - named capturing group
    () =>
      firstToken
        .matched(firstToken =>
          matchTokenSequence<string>(firstToken, [
            parenthesisOpenMatcher,
            questionMarkMatcher,
            chevronsOpenMatcher,
            wordMatcher,
            chevronsCloseMatcher,
          ]),
        )
        .matched(groupName => {
          const name = groupName.values.at(0);
          if (!name) {
            return match.err(ctx.reportError(groupName.token, "Can't parse group name"));
          }
          if (ctx.foundGroupSpecifiers.has(name)) {
            return match.err(ctx.reportError(groupName.token, `Group name '${name}' is already defined`));
          }

          const specifier = factory.createGroupNameNode(name, { start: groupName.start + 2, end: groupName.end });
          return match.ok({ token: groupName.token, type: 'capturing', specifier } as const);
        }),

    () => firstToken.map(token => ({ token, type: 'capturing', specifier: null })),
  );

  const collectedNodes = groupMeta
    .matched(pipe2(getToken, matchNextToken))
    .matched(x => fillExpressions(x, ctx, parseNodeInGroup));

  return match
    .all(firstToken, groupMeta, collectedNodes)
    .map(([firstToken, { type, specifier }, { nodes, token: lastToken }]) => {
      const node = factory.createGroupNode(type, specifier, nodes, positionRange(firstToken, lastToken));
      if (specifier) {
        ctx.foundGroupSpecifiers.set(specifier.name, node);
      }

      return createParserResult(parentNodes.concat(node), lastToken);
    });
};

// Implementation A-z - char range
export const parseCharRange: NodeParser = ({ token: startToken, nodes }, ctx, recursiveFn = parseCharRange) => {
  const nextNodes = matchNextToken(startToken)
    .orError(() => ctx.reportError(startToken, commonErrorMessages.EOL))
    .matched(nextToken => recursiveFn(createParserResult([], nextToken), ctx));

  const fromNode = matchLastNode(nodes).filter(isCharNode);
  const toNode = nextNodes
    .matched(pipe2(getNodes, matchFirstNode))
    .filter(isCharNode)
    .orError(() => ctx.reportError(0, commonErrorMessages.UnexpectedToken));

  const rangeNode = match.all(fromNode, toNode).matched(([from, to]) => {
    const fromCharCode = from.value.charCodeAt(0);
    const toCharCode = to.value.charCodeAt(0);
    if (fromCharCode > toCharCode) {
      return match.err(
        ctx.reportError(
          positionRange(from, to),
          `Character range is out of order: from '${from.value}' (index ${fromCharCode}) to '${to.value}' (index ${toCharCode})`,
        ),
      );
    }
    return match.ok(factory.createCharRangeNode(from, to));
  });

  return match
    .all(nextNodes, fromNode, toNode, rangeNode)
    .map(([next, from, to, range]) =>
      createParserResult(replace(nodes, from, range).concat(remove(next.nodes, to)), next.token),
    );
};

// Implementation [...] - char class
// Implementation [^...] - negative char class
export const parseCharClass: NodeParser = ({ token: inputToken, nodes: parentNodes }, ctx) => {
  const parseTokenInCharClass: NodeParser = (x, ctx) => {
    const token = getToken(x);

    if (isBracketsCloseToken(token)) {
      return match.none();
    }

    if (ctx.tokenizer.isLastToken(token)) {
      return match.err(ctx.reportError(positionRange(inputToken, token), 'Character class missing closing bracket'));
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

  const firstToken = match
    .ok(inputToken)
    .filter(isBracketsOpenToken)
    .orError(() => ctx.reportError(inputToken, 'Trying to parse expression as character class, but got invalid input'));

  const negative = firstToken.matched(firstToken =>
    matchTokenSequence(firstToken, [
      [TokenKind.SyntaxChar, { value: '[' }],
      [TokenKind.SyntaxChar, { value: '^' }],
    ]),
  );

  const startingStep = negative
    .matched(pipe2(getToken, matchNextToken))
    .orElse(() => firstToken.matched(matchNextToken))
    .orError(() => ctx.reportError(inputToken, commonErrorMessages.EOL));

  const foundNodes = startingStep.matched(x => fillExpressions(x, ctx, parseTokenInCharClass));

  return match
    .all(firstToken, negative.isMatched(), foundNodes)
    .map(([firstToken, isNegative, { token: lastToken, nodes }]) => {
      const charClassNode = factory.createCharClassNode(isNegative, nodes, positionRange(firstToken, lastToken));
      return createParserResult(parentNodes.concat(charClassNode), lastToken);
    });
};

export const parseCharEscape: NodeParser = (x, ctx) => {
  switch (x.token.value) {
    case 'x':
      return match.first(
        () => parseHexChar(x, ctx),
        () => parseEscapedChar(x, ctx),
      );

    case 'u':
      return match.first(
        () => parseUnicodeChar(x, ctx),
        () => parseEscapedChar(x, ctx),
      );

    case 'c':
      return match.first(
        () => parseASCIIControlChar(x, ctx),
        () => parseEscapedChar(x, ctx),
      );

    default:
      return match.none();
  }
};

export const parseEscapedChar: NodeParser = createSimpleParser(token =>
  factory.createCharNode(token.value, token, 'escaped'),
);

export const parseSimpleChar: NodeParser = createSimpleParser(token =>
  factory.createCharNode(token.value, token, 'simple'),
);

export const parseCharClassEscape: NodeParser = x => {
  const token = getToken(x);
  switch (token.value) {
    // Implementation \d - any digit
    case 'd':
      return createSimpleParser(token => factory.createSimpleNode<AnyDigitNode>(SyntaxKind.AnyDigit, token))(x);
    // Implementation \D - any non digit
    case 'D':
      return createSimpleParser(token => factory.createSimpleNode<NonDigitNode>(SyntaxKind.NonDigit, token))(x);
    // Implementation \s - any whitespace
    case 's':
      return createSimpleParser(token => factory.createSimpleNode<AnyWhitespaceNode>(SyntaxKind.AnyWhitespace, token))(
        x,
      );
    // Implementation \S - non whitespace
    case 'S':
      return createSimpleParser(token => factory.createSimpleNode<NonWhitespaceNode>(SyntaxKind.NonWhitespace, token))(
        x,
      );
    // Implementation \w - any word [a-zA-Z0-9_]
    case 'w':
      return createSimpleParser(token => factory.createSimpleNode<AnyWordNode>(SyntaxKind.AnyWord, token))(x);
    // Implementation \w - any non word [^a-zA-Z0-9_]
    case 'W':
      return createSimpleParser(token => factory.createSimpleNode<NonWordNode>(SyntaxKind.NonWord, token))(x);
  }

  return match.none();
};
export const parseControlEscapeHandler: NodeParser = (x, ctx) => {
  const token = getToken(x);
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
      return match.err(ctx.reportError(token, `Unsupported Control escape character: \\${token.value}`));
  }

  return createSimpleParser(token => factory.createControlEscapeNode(type, token))(x);
};

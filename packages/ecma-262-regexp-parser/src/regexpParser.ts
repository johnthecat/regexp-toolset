import type { RegexpTokenizer, TokenStep } from './regexpTokenizer.js';
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
  AnyRegexpNode,
  GroupNameNode,
  GroupNode,
  NodePosition,
  QuantifierNodeRangeValue,
  RegexpNode,
} from './regexpNodes.js';
import { CharType, ControlEscapeCharType, QuantifierType } from './regexpNodes.js';
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
} from './regexpNodeTypes.js';
import type { NodeParser, NodeParserResultValue, ParserContext, SingleNodeParser } from './regexpParseTypes.js';
import {
  createCharEscapeMatcher,
  createPatternCharMatcher,
  createSyntaxCharMatcher,
  hexMatcher,
  matchTokenSequence,
  numberMatcher,
  octalMatcher,
  mapMatcher,
  wordMatcher,
} from './regexpSequenceMatcher.js';
import { fillExpressions } from './regexpParseUtils.js';
import { concat, remove, replace } from './common/array.js';
import { isNumber, not } from './common/typeCheckers.js';
import type { Match } from './common/fp/match.js';
import { ok, none, all, err, nonNullable, first } from './common/fp/match.js';
import { view, type Lens } from './common/fp/lens.js';
import { pipe2 } from './common/pipe.js';

const commonErrorMessages = {
  EOL: 'Unexpected end of line',
  UnexpectedToken: 'Unexpected token',
};

// helpers

const nodesL: Lens<NodeParserResultValue, AnyRegexpNode[]> = (f, x) => ({ ...x, nodes: f(x.nodes) });
const tokenL: Lens<{ token: TokenStep }, TokenStep> = (f, x) => ({ ...x, token: f(x.token) });

const viewToken = view(tokenL);
const viewNodes = view(nodesL);

const matchNextToken = (token: TokenStep): Match<TokenStep> => nonNullable(token.next());
const matchFirstNode = (nodes: AnyRegexpNode[]) => nonNullable(nodes.at(0));
const matchLastNode = (nodes: AnyRegexpNode[]) => nonNullable(nodes.at(-1));

const createParserResult = (nodes: AnyRegexpNode[], token: TokenStep): NodeParserResultValue => ({ nodes, token });

const createSimpleParser =
  (fn: (token: TokenStep) => AnyRegexpNode) =>
  ({ nodes, token }: NodeParserResultValue) =>
    ok(createParserResult(concat(nodes, fn(token)), token));

const positionRange = (t1: NodePosition, t2: NodePosition): NodePosition => ({ start: t1.start, end: t2.end });

export const createParserContext = (source: string, tokenizer: RegexpTokenizer): ParserContext => ({
  source,
  tokenizer,
  foundGroupSpecifiers: new Map(),
  groupSpecifierDemands: new Set(),
  reportError: (position, message) => {
    let normalizedPosition: NodePosition;
    if (isNumber(position)) {
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

const connectSubpatternsWithGroups = (ctx: ParserContext): Match<void> => {
  for (const [tag, node] of ctx.groupSpecifierDemands) {
    const found = ctx.foundGroupSpecifiers.get(tag);
    if (!found) {
      return err(ctx.reportError(node, `This token references a non-existent or invalid subpattern`));
    }
    node.ref = found;
  }

  return ok(void 0);
};

// parser

export const parseRegexp: SingleNodeParser<RegexpNode> = (firstToken, ctx) => {
  const firstContentToken = matchNextToken(firstToken).orError(() => ctx.reportError(0, "Can't parse input"));
  const body = firstContentToken
    .match(token => fillExpressions(token, ctx, parseNodeInRegexp))
    .filterOrThrow(
      pipe2(viewToken, isForwardSlashToken),
      pipe2(viewToken, x => ctx.reportError(x, 'Regexp body should end with "/" symbol, like this: /.../gm')),
    );

  const flags = body
    .match(pipe2(viewToken, matchNextToken))
    .match(token => parseFlags(token, ctx))
    .orElse(() => ok(''));

  return connectSubpatternsWithGroups(ctx)
    .match(() => all([body.map(viewNodes), flags]))
    .map(([body, flags]) => ({ node: factory.createRegexpNode(body, flags) }));
};

const supportedFlags = ['g', 'i', 'm', 's', 'u', 'y'];
const lowercaseRegexp = /[a-z]/;
const parseFlags = (step: TokenStep, ctx: ParserContext): Match<string> => {
  let result = '';
  for (const currentStep of ctx.tokenizer.iterate(step)) {
    if (!isPatternCharToken(currentStep) || !lowercaseRegexp.test(currentStep.value)) {
      return err(ctx.reportError(currentStep, commonErrorMessages.UnexpectedToken));
    }
    if (!supportedFlags.includes(currentStep.value)) {
      return err(ctx.reportError(currentStep, `Unknown flag '${currentStep.value}'`));
    }
    result += currentStep.value;
  }
  return ok(result);
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
  const lazy = matchNextToken(token).match(x => matchTokenSequence(x, [createSyntaxCharMatcher('?')]));
  const lastToken = lazy.map(viewToken).orElse(() => ok(token));

  const quantifiableNode = matchLastNode(nodes)
    .orError(() => ctx.reportError(token, 'There is nothing to quantify'))
    .filterOrThrow(isQuantifiable, x => ctx.reportError(x, 'The preceding token is not quantifiable'));

  const quantifierNode = all([lazy.isMatched(), lastToken]).map(([isLazy, lastToken]) => {
    return factory.createQuantifierNode(
      {
        type:
          token.value === '?'
            ? QuantifierType.NoneOrSingle
            : token.value === '+'
            ? QuantifierType.SingleOrMany
            : QuantifierType.NoneOrMany,
        greedy: !isLazy,
      },
      positionRange(token, lastToken),
    );
  });

  return all([quantifiableNode, quantifierNode, lastToken]).map(([quantifiable, quantifier, lastToken]) =>
    createParserResult(replace(nodes, quantifiable, factory.createRepetitionNode(quantifiable, quantifier)), lastToken),
  );
};

// TODO move parser to separated file
const fromMatcher = mapMatcher<number, QuantifierNodeRangeValue>(numberMatcher, (f, x) => ({
  ...x,
  from: f(x.from),
}));
const toMatcher = mapMatcher<number, QuantifierNodeRangeValue>(numberMatcher, (f, x) => ({
  ...x,
  to: f(x.to ?? 0),
}));

// Implementation Y{1} ; Y{1,} ; Y{1,2} - range quantifier
export const parseRangeQuantifier: NodeParser = (x, ctx) => {
  const quantifiableNode = ok(viewNodes(x))
    .match(matchLastNode)
    .orError(() => ctx.reportError(viewToken(x), 'There is nothing to quantify'))
    .filterOrThrow(isQuantifiable, x => ctx.reportError(x, 'The preceding token is not quantifiable'));

  const range = first(
    () =>
      matchTokenSequence<QuantifierNodeRangeValue>(
        viewToken(x),
        [createSyntaxCharMatcher('{'), fromMatcher, createSyntaxCharMatcher('}')],
        { from: 0 },
      ),
    () =>
      matchTokenSequence<QuantifierNodeRangeValue>(
        viewToken(x),
        [createSyntaxCharMatcher('{'), fromMatcher, createPatternCharMatcher(','), createSyntaxCharMatcher('}')],
        {
          from: 0,
          to: Number.MAX_SAFE_INTEGER,
        },
      ),
    () =>
      matchTokenSequence<QuantifierNodeRangeValue>(
        viewToken(x),
        [
          createSyntaxCharMatcher('{'),
          fromMatcher,
          createPatternCharMatcher(','),
          toMatcher,
          createSyntaxCharMatcher('}'),
        ],
        { from: 0, to: 0 },
      ),
  );

  const value = range.map(({ value }) => value);
  const lazy = range
    .match(pipe2(viewToken, matchNextToken))
    .match(x => matchTokenSequence(x, [createSyntaxCharMatcher('?')]));

  const lastToken = lazy.orElse(() => range).map(viewToken);
  const position = lastToken.map(a => positionRange(viewToken(x), a));

  const quantifierNode = all([lazy.isMatched(), position, value]).map(([isLazy, position, { from, to }]) => {
    if (isNumber(to) && from > to) {
      throw ctx.reportError(position, 'The quantifier range is out of order');
    }

    return factory.createQuantifierNode(
      {
        type: QuantifierType.Range,
        greedy: !isLazy,
        from,
        to,
      },
      position,
    );
  });

  return all([quantifiableNode, quantifierNode, lastToken]).map(([quantifiable, quantifier, token]) =>
    createParserResult(
      replace(viewNodes(x), quantifiable, factory.createRepetitionNode(quantifiable, quantifier)),
      token,
    ),
  );
};

// Implementation \k<...> - subpattern match
export const parseSubpatternMatch: NodeParser = ({ token, nodes }, ctx) => {
  const subpattern = matchTokenSequence(
    token,
    [createCharEscapeMatcher('k'), createPatternCharMatcher('<'), wordMatcher, createPatternCharMatcher('>')],
    '',
  );

  return subpattern.map(subpattern => {
    const groupName = subpattern.value;
    const node = factory.createSubpatternNode(groupName, null, subpattern);
    ctx.groupSpecifierDemands.add([groupName, node]);
    return createParserResult(concat(nodes, node), subpattern.token);
  });
};

// Implementation \0 - null char
export const parseNullChar: NodeParser = x => {
  if (viewToken(x).value === '0') {
    return createSimpleParser(factory.createNullCharNode)(x);
  }
  return none();
};

// Implementation (...)\1 - back reference
export const parseBackReferenceChar: NodeParser = ({ token, nodes }) => {
  const groupNode = matchLastNode(nodes).filter(isGroupNode);
  const backReferenceToken = ok(token).filter(x => x.value === '1');
  const backReferenceNode = all([groupNode, backReferenceToken]).map(([group, token]) =>
    factory.createBackReferenceNode(group, positionRange(group, token)),
  );

  return all([groupNode, backReferenceNode, backReferenceToken]).map(([group, backReference, token]) =>
    createParserResult(replace(nodes, group, backReference), token),
  );
};

// Implementation [\b] - backspace
export const parseBackspace: NodeParser = x =>
  ok(x)
    .filter(pipe2(viewToken, x => isEscapedCharToken(x, 'b')))
    .match(createSimpleParser(factory.createBackspaceNode));

// Implementation .|. - disjunction
export const parseDisjunction: NodeParser = (
  { token: separatorToken, nodes: leftNodes },
  ctx,
  recursiveFn = parseNodeInRegexp,
) => {
  const wrappedRecursiveParser = (x: NodeParserResultValue, ctx: ParserContext) => {
    // creating tail recursion for correct nesting of multiple disjunctions
    return ok(x)
      .filter(pipe2(viewToken, x => !isSyntaxCharToken(x, '|')))
      .match(x => recursiveFn(x, ctx));
  };
  const rightNodesFirstToken = matchNextToken(separatorToken);

  return first(
    () =>
      rightNodesFirstToken
        .match(x => fillExpressions(x, ctx, wrappedRecursiveParser))
        .map(({ nodes: rightNodes, token }) =>
          createParserResult([factory.createDisjunctionNode(leftNodes, rightNodes, separatorToken)], token.prev()),
        ),

    () =>
      rightNodesFirstToken.unmatch(() =>
        ok(createParserResult([factory.createDisjunctionNode(leftNodes, [], separatorToken)], separatorToken)),
      ),
  );
};

// Implementation ^... - line start
export const parseLineStart: NodeParser = createSimpleParser(factory.createLineStartNode);

// Implementation ...$ - line end
export const parseLineEnd: NodeParser = createSimpleParser(factory.createLineEndNode);

// Implementation . - any character
export const parseAnyChar: NodeParser = createSimpleParser(factory.createAnyCharNode);

// Implementation \uYYYY - unicode symbol code
export const parseUnicodeChar: NodeParser = ({ nodes, token }) =>
  matchTokenSequence(token, [createCharEscapeMatcher('u'), hexMatcher, hexMatcher], '').map(unicode =>
    createParserResult(
      concat(
        nodes,
        factory.createCharNode(String.fromCharCode(parseInt(unicode.value, 16)), CharType.Unicode, unicode),
      ),
      unicode.token,
    ),
  );

// Implementation \xYY - hex symbol code
export const parseHexChar: NodeParser = ({ nodes, token }) =>
  matchTokenSequence(token, [createCharEscapeMatcher('x'), hexMatcher], '').map(hex =>
    createParserResult(
      concat(nodes, factory.createCharNode(String.fromCharCode(parseInt(hex.value, 16)), CharType.Hex, hex)),
      hex.token,
    ),
  );

// Implementation \ddd - octal char number
export const parseOctalChar: NodeParser = ({ nodes, token }) =>
  matchTokenSequence(token, [octalMatcher], '').map(octal =>
    createParserResult(
      concat(nodes, factory.createCharNode(String.fromCodePoint(parseInt(octal.value, 8)), CharType.Octal, octal)),
      octal.token,
    ),
  );

// Implementation \cA - ASCII control char
export const parseASCIIControlChar: NodeParser = ({ token, nodes }, ctx) => {
  const possibleValueToken = matchNextToken(token).filter(not(isForwardSlashToken));
  const valueToken = possibleValueToken.filterOrThrow(
    ({ value }) => /[A-Za-z]/.test(value),
    () =>
      ctx.reportError(
        {
          start: token.start,
          end: token.end + 1,
        },
        'Invalid control character',
      ),
  );

  return valueToken.map(valueToken => {
    const node = factory.createASCIIControlCharNode(valueToken.value, positionRange(token, valueToken));
    return createParserResult(concat(nodes, node), valueToken);
  });
};

const parseUnicodeProperty: NodeParser = x => {
  const unicodePropertyWithValue = matchTokenSequence<{ name: string; value: string }>(
    x.token,
    [
      createCharEscapeMatcher('p'),
      createSyntaxCharMatcher('{'),
      mapMatcher(wordMatcher, (f, x) => ({ ...x, name: f(x.name) })),
      createPatternCharMatcher('='),
      mapMatcher(wordMatcher, (f, x) => ({ ...x, value: f(x.value) })),
      createSyntaxCharMatcher('}'),
    ],
    { name: '', value: '' },
  );
  const unicodePropertyWithoutValue = matchTokenSequence<{ name: string; value: null }>(
    x.token,
    [
      createCharEscapeMatcher('p'),
      createSyntaxCharMatcher('{'),
      mapMatcher(wordMatcher, (f, x) => ({ ...x, name: f(x.name) })),
      createSyntaxCharMatcher('}'),
    ],
    { name: '', value: null },
  );

  const matchedConstruction = unicodePropertyWithValue.orElse(() => unicodePropertyWithoutValue);
  const position = matchedConstruction.map(y => positionRange(x.token, y.token));
  const value = matchedConstruction.map(({ value }) => value);
  const unicodePropertyNode = all([value, position]).map(([{ name, value }, position]) =>
    factory.createUnicodePropertyNode(name, value, position),
  );

  return all([unicodePropertyNode, matchedConstruction.map(viewToken)]).map(([node, token]) =>
    createParserResult(concat(x.nodes, node), token),
  );
};

const parseNonUnicodeProperty: NodeParser = x => {
  const unicodePropertyWithValue = matchTokenSequence<{ name: string; value: string }>(
    x.token,
    [
      createCharEscapeMatcher('P'),
      createSyntaxCharMatcher('{'),
      mapMatcher(wordMatcher, (f, x) => ({ ...x, name: f(x.name) })),
      createPatternCharMatcher('='),
      mapMatcher(wordMatcher, (f, x) => ({ ...x, value: f(x.value) })),
      createSyntaxCharMatcher('}'),
    ],
    { name: '', value: '' },
  );
  const unicodePropertyWithoutValue = matchTokenSequence<{ name: string; value: null }>(
    x.token,
    [
      createCharEscapeMatcher('P'),
      createSyntaxCharMatcher('{'),
      mapMatcher(wordMatcher, (f, x) => ({ ...x, name: f(x.name) })),
      createSyntaxCharMatcher('}'),
    ],
    { name: '', value: null },
  );

  const matchedConstruction = unicodePropertyWithValue.orElse(() => unicodePropertyWithoutValue);
  const position = matchedConstruction.map(y => positionRange(x.token, y.token));
  const value = matchedConstruction.map(({ value }) => value);
  const unicodePropertyNode = all([value, position]).map(([{ name, value }, position]) =>
    factory.createNonUnicodePropertyNode(name, value, position),
  );

  return all([unicodePropertyNode, matchedConstruction.map(viewToken)]).map(([node, token]) =>
    createParserResult(concat(x.nodes, node), token),
  );
};

// eslint-disable-next-line complexity
export const parseNodeInRegexp: NodeParser = (x, ctx, recursiveFn = parseNodeInRegexp) => {
  const token = viewToken(x);
  switch (token.kind) {
    case TokenKind.PatternChar:
      switch (token.value) {
        case '/':
          // End of regexp body
          return none();

        default:
          return parseSimpleChar(x, ctx);
      }

    case TokenKind.Decimal:
      return parseSimpleChar(x, ctx);

    case TokenKind.SyntaxChar:
      switch (token.value) {
        case '(':
          return parseGroup(x, ctx);

        case '[':
          return parseCharClass(x, ctx);

        case '{':
          return first(
            () => parseRangeQuantifier(x, ctx),
            () => parseSimpleChar(x, ctx),
          );

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
          return err(ctx.reportError(token, 'Unmatched parenthesis'));

        default:
          return err(ctx.reportError(token, commonErrorMessages.UnexpectedToken));
      }

    case TokenKind.CharClassEscape:
      return parseCharClassEscape(x, ctx);

    case TokenKind.ControlEscape:
      return parseControlEscapeHandler(x, ctx);

    case TokenKind.CharEscape:
      switch (token.value) {
        case 'b':
          return createSimpleParser(factory.createWordBoundaryNode)(x);
        case 'B':
          return createSimpleParser(factory.createNonWordBoundaryNode)(x);
        case 'p':
          return first(
            () => parseUnicodeProperty(x, ctx),
            () => parseEscapedChar(x, ctx),
          );
        case 'P':
          return first(
            () => parseNonUnicodeProperty(x, ctx),
            () => parseEscapedChar(x, ctx),
          );
        case 'k':
          return first(
            () => parseSubpatternMatch(x, ctx),
            () => parseEscapedChar(x, ctx),
          );
        default:
          return first(
            () => parseCharEscape(x, ctx),
            () => parseEscapedChar(x, ctx),
          );
      }

    case TokenKind.DecimalEscape:
      return first(
        () => parseOctalChar(x, ctx),
        () => parseNullChar(x, ctx),
        () => parseBackReferenceChar(x, ctx),
        () => parseEscapedChar(x, ctx),
      );
  }
};

type GroupMeta = { token: TokenStep; specifier: GroupNameNode | null; type: GroupNode['type'] };

const collectGroupMeta = (token: Match<TokenStep>, ctx: ParserContext): Match<GroupMeta> => {
  const hasMeta = token.match(matchNextToken).filter(x => isSyntaxCharToken(x, '?'));

  return hasMeta
    .match(matchNextToken)
    .match(token =>
      first<GroupMeta>(
        // Implementation (?=...) - positive lookahead
        () =>
          ok(token)
            .filter(x => isPatternCharToken(x, '='))
            .map(token => ({
              token,
              type: 'positiveLookahead',
              specifier: null,
            })),

        // Implementation (?!...) - negative lookahead
        () =>
          ok(token)
            .filter(x => isPatternCharToken(x, '!'))
            .map(token => ({
              token,
              type: 'negativeLookahead',
              specifier: null,
            })),

        // Implementation (?<=...) - positive lookbehind
        () =>
          matchTokenSequence(token, [createPatternCharMatcher('<'), createPatternCharMatcher('=')]).map(
            ({ token }) => ({
              token,
              type: 'positiveLookbehind',
              specifier: null,
            }),
          ),

        // Implementation (?<!...) - negative lookbehind
        () =>
          matchTokenSequence(token, [createPatternCharMatcher('<'), createPatternCharMatcher('!')]).map(
            ({ token }) => ({
              token,
              type: 'negativeLookbehind',
              specifier: null,
            }),
          ),

        // Implementation (?:...) - non-capturing group
        () =>
          ok(token)
            .filter(x => isPatternCharToken(x, ':'))
            .map(token => ({
              token,
              type: 'nonCapturing',
              specifier: null,
            })),

        // Implementation (?<tag_name>...) - named capturing group
        () =>
          matchTokenSequence<string>(
            token,
            [createPatternCharMatcher('<'), wordMatcher, createPatternCharMatcher('>')],
            '',
          )
            .filterOrThrow(
              ({ value }) => !ctx.foundGroupSpecifiers.has(value),
              ({ value, token }) => ctx.reportError(token, `Group name '${value}' is already defined`),
            )
            .map(groupName => {
              const specifier = factory.createGroupNameNode(groupName.value, groupName);
              return { token: groupName.token, type: 'capturing', specifier };
            }),
      ),
    )
    .unmatch<GroupMeta>(() => token.map(token => ({ token, type: 'capturing', specifier: null })));
};

// Implementation (...) - capturing group
// eslint-disable-next-line complexity
export const parseGroup: NodeParser = ({ token: inputToken, nodes: parentNodes }, ctx) => {
  const parseNodeInGroup: NodeParser = (x, ctx) =>
    ok(viewToken(x))
      // Closing group
      .filter(not(isParenthesesCloseToken))
      // We shouldn't find any forward slash inside group
      .filterOrThrow(not(isForwardSlashToken), x =>
        ctx.reportError(positionRange(inputToken, x), 'Incomplete group structure'),
      )
      .match(() => parseNodeInRegexp(x, ctx, parseNodeInGroup));

  const firstToken = ok(inputToken).filterOrThrow(isParenthesesOpenToken, () =>
    ctx.reportError(inputToken, 'Trying to parse expression as group, but got invalid input'),
  );
  const groupMeta = collectGroupMeta(firstToken, ctx);
  const collectedNodes = groupMeta
    .match(pipe2(viewToken, matchNextToken))
    .match(x => fillExpressions(x, ctx, parseNodeInGroup));

  return all([firstToken, groupMeta, collectedNodes]).map(
    ([firstToken, { type, specifier }, { nodes, token: lastToken }]) => {
      const node = factory.createGroupNode(type, specifier, nodes, positionRange(firstToken, lastToken));
      if (specifier) {
        ctx.foundGroupSpecifiers.set(specifier.name, node);
      }

      return createParserResult(concat(parentNodes, node), lastToken);
    },
  );
};

// Implementation A-z - char range
export const parseCharRange: NodeParser = ({ token: startToken, nodes }, ctx, recursiveFn = parseCharRange) => {
  const nextNodes = matchNextToken(startToken)
    .orError(() => ctx.reportError(startToken, commonErrorMessages.EOL))
    .match(nextToken => recursiveFn(createParserResult([], nextToken), ctx));

  const fromNode = matchLastNode(nodes).filter(isCharNode);
  const toNode = nextNodes
    .match(pipe2(viewNodes, matchFirstNode))
    .filterOrThrow(isCharNode, x => ctx.reportError(x, commonErrorMessages.UnexpectedToken));

  const rangeNode = all([fromNode, toNode])
    .filterOrThrow(
      ([from, to]) => from.value.charCodeAt(0) <= to.value.charCodeAt(0),
      ([from, to]) =>
        ctx.reportError(
          positionRange(from, to),
          `Character range is out of order: from '${from.value}' (index ${from.value.charCodeAt(0)}) to '${
            to.value
          }' (index ${to.value.charCodeAt(0)})`,
        ),
    )
    .map(([from, to]) => factory.createCharRangeNode(from, to));

  return all([nextNodes, fromNode, toNode, rangeNode]).map(([next, from, to, range]) =>
    createParserResult(concat(replace(nodes, from, range), remove(next.nodes, to)), next.token),
  );
};

// Implementation [...] - char class
// Implementation [^...] - negative char class
export const parseCharClass: NodeParser = ({ token: inputToken, nodes: parentNodes }, ctx) => {
  const parseTokenInCharClass: NodeParser = (x, ctx) => {
    return ok(viewToken(x))
      .filter(not(isBracketsCloseToken))
      .filterOrThrow(not(ctx.tokenizer.isLastToken), x =>
        ctx.reportError(positionRange(inputToken, x), 'Character class missing closing bracket'),
      )
      .match(token => {
        switch (token.kind) {
          case TokenKind.SyntaxChar:
            return parseSimpleChar(x, ctx);

          case TokenKind.CharEscape:
            return first(
              () => parseBackspace(x, ctx),
              () => parseCharEscape(x, ctx),
              () => parseEscapedChar(x, ctx),
            );

          case TokenKind.CharClassEscape:
            return parseCharClassEscape(x, ctx);

          case TokenKind.ControlEscape:
            return parseControlEscapeHandler(x, ctx);

          case TokenKind.DecimalEscape:
            return first(
              () => parseOctalChar(x, ctx),
              () => parseEscapedChar(x, ctx),
            );

          case TokenKind.Decimal:
            return parseSimpleChar(x, ctx);

          case TokenKind.PatternChar:
            switch (token.value) {
              case '-':
                return first(
                  () => parseCharRange(x, ctx, parseTokenInCharClass),
                  () => parseSimpleChar(x, ctx),
                );

              default:
                return parseSimpleChar(x, ctx);
            }
        }
      });
  };

  const firstToken = ok(inputToken).filterOrThrow(isBracketsOpenToken, x =>
    ctx.reportError(x, 'Trying to parse expression as character class, but got invalid input'),
  );

  const negative = firstToken.match(firstToken =>
    matchTokenSequence(firstToken, [createSyntaxCharMatcher('['), createSyntaxCharMatcher('^')]),
  );

  const startingStep = negative
    .match(pipe2(viewToken, matchNextToken))
    .orElse(() => firstToken.match(matchNextToken))
    .orError(() => ctx.reportError(inputToken, commonErrorMessages.EOL));

  const foundNodes = startingStep.match(x => fillExpressions(x, ctx, parseTokenInCharClass));

  return all([negative.isMatched(), firstToken, foundNodes]).map(
    ([isNegative, firstToken, { token: lastToken, nodes }]) => {
      const charClassNode = factory.createCharClassNode(isNegative, nodes, positionRange(firstToken, lastToken));
      return createParserResult(concat(parentNodes, charClassNode), lastToken);
    },
  );
};

export const parseCharEscape: NodeParser = (x, ctx) => {
  switch (x.token.value) {
    case 'x':
      return first(
        () => parseHexChar(x, ctx),
        () => parseEscapedChar(x, ctx),
      );

    case 'u':
      return first(
        () => parseUnicodeChar(x, ctx),
        () => parseEscapedChar(x, ctx),
      );

    case 'c':
      return first(
        () => parseASCIIControlChar(x, ctx),
        () => parseEscapedChar(x, ctx),
      );

    default:
      return none();
  }
};

export const parseEscapedChar: NodeParser = createSimpleParser(token =>
  factory.createCharNode(token.value, CharType.Escaped, token),
);

export const parseSimpleChar: NodeParser = createSimpleParser(token =>
  factory.createCharNode(token.value, CharType.Simple, token),
);

export const parseCharClassEscape: NodeParser = x => {
  const token = viewToken(x);
  switch (token.value) {
    // Implementation \d - any digit
    case 'd':
      return createSimpleParser(factory.createAnyDigitNode)(x);
    // Implementation \D - any non digit
    case 'D':
      return createSimpleParser(factory.createNonDigitNode)(x);
    // Implementation \s - any whitespace
    case 's':
      return createSimpleParser(factory.createAnyWhitespaceNode)(x);
    // Implementation \S - non whitespace
    case 'S':
      return createSimpleParser(factory.createNonWhitespaceNode)(x);
    // Implementation \w - any word [a-zA-Z0-9_]
    case 'w':
      return createSimpleParser(factory.createAnyWordNode)(x);
    // Implementation \w - any non word [^a-zA-Z0-9_]
    case 'W':
      return createSimpleParser(factory.createNonWordNode)(x);
  }

  return none();
};

export const parseControlEscapeHandler: NodeParser = (x, ctx) => {
  const token = viewToken(x);
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
      return err(ctx.reportError(token, `Unsupported Control escape character: \\${token.value}`));
  }

  return createSimpleParser(token => factory.createControlEscapeNode(type, token))(x);
};

import type {
  charClassEscapeHandler,
  charEscapeHandler,
  controlEscapeHandler,
  RegexpTokenizer,
  Step,
} from './regexpTokenizer.js';
import {
  isBracketsCloseToken,
  isBracketsOpenToken,
  isEscapedCharToken,
  isParenthesesCloseToken,
  isParenthesesOpenToken,
  isPatternCharToken,
  isSyntaxCharToken,
  regexpTokenizer,
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
  SubpatternNode,
  WordBoundaryNode,
} from './regexpNodes.js';
import { ControlEscapeCharType, QuantifierType, SyntaxKind } from './regexpNodes.js';
import * as factory from './regexpNodeFactory.js';
import { createRegexpNode, createSimpleNode } from './regexpNodeFactory.js';
import type { ParserContext, TokenParser, TokenParserResult } from './regexpParseTypes.js';
import {
  fillExpressions,
  forwardParser,
  hexMatcher,
  matchedToken,
  matchFirst,
  matchTokenSequence,
  numberMatcher,
  octalMatcher,
  sealExpressions,
  unmatchedToken,
  wordMatcher,
} from './regexpParseUtils.js';
import type { InferHandlerResult } from './abstract/tokenizer.js';

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

const createParserContext = (source: string, tokenizer: RegexpTokenizer): ParserContext => ({
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

const connectSubpatternsWithGroups = (ctx: ParserContext): void => {
  for (const [tag, node] of ctx.groupSpecifierDemands) {
    const found = ctx.foundGroupSpecifiers.get(tag);
    assertNullable(found, ctx.reportError(node, `This token references a non-existent or invalid subpattern`));
    node.ref = found;
  }
};

export const parseRegexp = (source: string | RegExp) => {
  const rawSource = source instanceof RegExp ? `/${source.source}/${source.flags}` : source;
  const tokenizer = regexpTokenizer(rawSource);
  const ctx = createParserContext(rawSource, tokenizer);

  const firstToken = tokenizer.getFirstStep();
  assertNullable(firstToken, ctx.reportError({ start: 0, end: rawSource.length - 1 }, "Can't parse input"));

  if (!isPatternCharToken(firstToken, '/')) {
    throw ctx.reportError(0, 'Regexp should start with "/" symbol, like this: /.../gm');
  }

  const firstContentToken = firstToken.next();
  assertNullable(firstContentToken, ctx.reportError({ start: firstToken.start }, "Can't parse input"));

  const { expressions, lastStep: closingToken } = fillExpressions(firstContentToken, ctx, parseTokenInRegexp);
  if (!isPatternCharToken(closingToken, '/')) {
    throw ctx.reportError(rawSource.length - 1, commonErrorMessages.UnexpectedToken);
  }

  const firstFlagToken = closingToken.next();
  const regexpNode = createRegexpNode(expressions, firstFlagToken ? parseFlags(firstFlagToken, ctx) : '');
  connectSubpatternsWithGroups(ctx);

  return regexpNode;
};

export const parseRegexpNode = (source: string): AnyRegexpNode => {
  const tokenizer = regexpTokenizer(source);
  const ctx = createParserContext(source, tokenizer);

  const firstStep = tokenizer.getFirstStep();
  assertNullable(firstStep, ctx.reportError({ start: 0, end: source.length - 1 }, "Can't parse input"));

  const { expressions, lastStep } = fillExpressions(firstStep, ctx, parseTokenInRegexp);
  connectSubpatternsWithGroups(ctx);

  return sealExpressions(expressions, firstStep, lastStep);
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
const parseQuantifier: TokenParser = (token, expressions, ctx) => {
  const prevNode = expressions.at(-1);
  assertNullable(prevNode, ctx.reportError(token, 'There is nothing to quantify'));
  if (!isQuantifiable(prevNode)) {
    throw ctx.reportError(token, 'The preceding token is not quantifiable');
  }

  const lazy = matchTokenSequence(token, [TokenKind.SyntaxChar, [TokenKind.SyntaxChar, { value: '?' }]]);
  const quantifierNode = factory.createQuantifierNode(lazy.match ? lazy : token, {
    type:
      token.value === '?'
        ? QuantifierType.NoneOrSingle
        : token.value === '+'
        ? QuantifierType.SingleOrMany
        : QuantifierType.NoneOrMany,
    greedy: !lazy.match,
  });
  expressions.pop();
  return matchedToken(
    lazy.match ? lazy.lastStep : token,
    expressions.concat(factory.createRepetitionNode(prevNode, quantifierNode)),
  );
};

// Implementation Y{1} ; Y{1,} ; Y{1,2} - range quantifier
const parseQuantifierRange: TokenParser = (token, expressions, ctx) => {
  const prevNode = expressions.at(-1);
  assertNullable(prevNode, ctx.reportError(token, 'There is nothing to quantify'));
  if (!isQuantifiable(prevNode)) {
    throw ctx.reportError(token, 'The preceding token is not quantifiable');
  }

  const trySequence = (
    token: Step,
    expressions: AnyRegexpNode[],
    seq: Parameters<typeof matchTokenSequence<number>>[1],
  ): TokenParserResult => {
    const range = matchTokenSequence<number>(token, seq);
    const lazy = matchTokenSequence(range.lastStep, [TokenKind.SyntaxChar, [TokenKind.SyntaxChar, { value: '?' }]]);

    if (!range.match) {
      return {
        done: false,
        match: false,
        value: token,
        result: expressions,
      };
    }

    const from = range.values.at(0);
    const to = range.values.at(1);
    assertNullable(from, ctx.reportError(range, "Can't parse numeric values from range."));

    if (typeof to === 'number' && from > to) {
      throw ctx.reportError(range, 'The quantifier range is out of order');
    }

    const quantifierNode = factory.createQuantifierNode(
      { start: range.start, end: lazy.match ? lazy.end : range.end },
      {
        greedy: !lazy.match,
        type: QuantifierType.Range,
        from,
        to,
      },
    );

    expressions.pop();
    const repetitionNode = factory.createRepetitionNode(prevNode, quantifierNode);
    return matchedToken(lazy.match ? lazy.lastStep : range.lastStep, expressions.concat(repetitionNode));
  };

  {
    const exactNumberResult = trySequence(token, expressions, [
      [TokenKind.SyntaxChar, { value: '{' }],
      numberMatcher,
      [TokenKind.SyntaxChar, { value: '}' }],
    ]);
    if (exactNumberResult.match) {
      return exactNumberResult;
    }
  }

  {
    const fromNumberResult = trySequence(token, expressions, [
      [TokenKind.SyntaxChar, { value: '{' }],
      numberMatcher,
      [TokenKind.PatternChar, { value: ',' }, step => ({ match: true, step, value: Number.POSITIVE_INFINITY })],
      [TokenKind.SyntaxChar, { value: '}' }],
    ]);
    if (fromNumberResult.match) {
      return fromNumberResult;
    }
  }

  {
    const fromToNumberResult = trySequence(token, expressions, [
      [TokenKind.SyntaxChar, { value: '{' }],
      numberMatcher,
      [TokenKind.PatternChar, { value: ',' }],
      numberMatcher,
      [TokenKind.SyntaxChar, { value: '}' }],
    ]);
    if (fromToNumberResult.match) {
      return fromToNumberResult;
    }
  }

  return unmatchedToken(token, expressions);
};

// Implementation \k<...> - subpattern match
const parseSubpatternMatch: TokenParser = (token, expressions, ctx) => {
  const subpattern = matchTokenSequence(token, [
    [TokenKind.CharEscape, { value: 'k' }],
    [TokenKind.PatternChar, { value: '<' }],
    wordMatcher,
    [TokenKind.PatternChar, { value: '>' }],
  ]);

  if (!subpattern.match) {
    return unmatchedToken(token, expressions);
  }

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
  return {
    done: true,
    match: true,
    value: subpattern.lastStep,
    result: expressions.concat(node),
  };
};

// Implementation \0 - null char
const parseNullChar: TokenParser = (token, expressions) => {
  if (token.value === '0') {
    return matchedToken(token, expressions.concat(factory.createSimpleNode<NullCharNode>(SyntaxKind.NullChar, token)));
  }

  return unmatchedToken(token, expressions);
};

// Implementation (...)\1 - back reference
const parseBackReferenceChar: TokenParser = (token, expressions) => {
  const prevNode = expressions.at(-1);
  if (token.value === '1' && prevNode && prevNode.kind === SyntaxKind.Group) {
    expressions.pop();
    return matchedToken(
      token,
      expressions.concat(
        factory.createBackReferenceNode(
          {
            start: prevNode.start,
            end: token.end,
          },
          prevNode,
        ),
      ),
    );
  }

  return unmatchedToken(token, expressions);
};

// Implementation [\b] - backspace
const parseBackspace: TokenParser = (token, expressions) => {
  if (isEscapedCharToken(token, 'b')) {
    return matchedToken(
      token,
      expressions.concat(factory.createSimpleNode<BackspaceNode>(SyntaxKind.Backspace, token)),
    );
  }
  return unmatchedToken(token, expressions);
};

// Implementation .|. - disjunction
const parseDisjunction: TokenParser = (token, expressions, ctx, recursiveFn = parseTokenInRegexp) => {
  const leftNodes = expressions;
  const nextToken = token.next();

  if (!nextToken) {
    return matchedToken(token, [factory.createDisjunctionNode(leftNodes, [], token)]);
  }

  const { expressions: rightNodes, lastStep } = fillExpressions(nextToken, ctx, (token, expressions, ctx) => {
    // creating tail recursion for correct nesting of multiple disjunctions
    if (isSyntaxCharToken(token, '|')) {
      return matchedToken(token.prev(), expressions);
    }
    const result = recursiveFn(token, expressions, ctx);
    if (result.done) {
      return matchedToken(result.value.prev(), result.result);
    }
    return result;
  });

  return matchedToken(lastStep, [factory.createDisjunctionNode(leftNodes, rightNodes, token)]);
};

// Implementation ^... - line start
const parseLineStart: TokenParser = (token, expressions) =>
  matchedToken(token, expressions.concat(factory.createSimpleNode<LineStartNode>(SyntaxKind.LineStart, token)));

// Implementation ...$ - line end
const parseLineEnd: TokenParser = (token, expressions) =>
  matchedToken(token, expressions.concat(factory.createSimpleNode<LineEndNode>(SyntaxKind.LineEnd, token)));

// Implementation . - any character
const parseAnyChar: TokenParser = (token, expressions) =>
  matchedToken(token, expressions.concat(factory.createSimpleNode<AnyCharNode>(SyntaxKind.AnyChar, token)));

// eslint-disable-next-line complexity
const parseTokenInRegexp: TokenParser = (token, expressions, ctx, recursiveFn = parseTokenInRegexp) => {
  switch (token.kind) {
    case TokenKind.CharClassEscape:
      return forwardParser(parseCharClassEscape(token, expressions, ctx));

    case TokenKind.ControlEscape:
      return forwardParser(parseControlEscapeHandler(token, expressions, ctx));

    case TokenKind.CharEscape:
      switch (token.value) {
        case 'b':
          return {
            done: false,
            match: true,
            value: token,
            result: expressions.concat(createSimpleNode<WordBoundaryNode>(SyntaxKind.WordBoundary, token)),
          };
        case 'B':
          return {
            done: false,
            match: true,
            value: token,
            result: expressions.concat(createSimpleNode<NonWordBoundaryNode>(SyntaxKind.NonWordBoundary, token)),
          };
        case 'k':
          return forwardParser(
            matchFirst(token, expressions, [
              (token, expressions) => parseSubpatternMatch(token, expressions, ctx),
              (token, expressions) => parseEscapedChar(token, expressions, ctx),
            ]),
          );
        default:
          return forwardParser(
            matchFirst(token, expressions, [
              (token, expressions) => parseCharEscape(token, expressions, ctx),
              (token, expressions) => parseEscapedChar(token, expressions, ctx),
            ]),
          );
      }

    case TokenKind.DecimalEscape: {
      return forwardParser(
        matchFirst(token, expressions, [
          (token, expressions) => parseOctalChar(token, expressions, ctx),
          (token, expressions) => parseNullChar(token, expressions, ctx),
          (token, expressions) => parseBackReferenceChar(token, expressions, ctx),
          (token, expressions) => parseEscapedChar(token, expressions, ctx),
        ]),
      );
    }

    case TokenKind.PatternChar:
      switch (token.value) {
        // End of regexp body
        case '/':
          return matchedToken(token, expressions);

        default:
          return forwardParser(parseSimpleChar(token, expressions, ctx));
      }

    case TokenKind.Decimal:
      return forwardParser(parseSimpleChar(token, expressions, ctx));

    case TokenKind.SyntaxChar:
      switch (token.value) {
        case '[':
          return forwardParser(parseCharClass(token, expressions, ctx));

        case '{':
          return forwardParser(
            matchFirst(token, expressions, [
              (token, expressions) => parseQuantifierRange(token, expressions, ctx),
              (token, expressions) => parseSimpleChar(token, expressions, ctx),
            ]),
          );

        case '(':
          return forwardParser(parseCapturingGroup(token, expressions, ctx));

        case '^':
          return forwardParser(parseLineStart(token, expressions, ctx));

        case '$':
          return forwardParser(parseLineEnd(token, expressions, ctx));

        case '.':
          return forwardParser(parseAnyChar(token, expressions, ctx));

        case '*':
        case '+':
        case '?':
          return forwardParser(parseQuantifier(token, expressions, ctx));

        case '|':
          return forwardParser(parseDisjunction(token, expressions, ctx, recursiveFn));

        case '}':
          return forwardParser(parseSimpleChar(token, expressions, ctx));

        case ')':
          throw ctx.reportError(token, 'Unmatched parenthesis');

        default:
          throw ctx.reportError(token, commonErrorMessages.UnexpectedToken);
      }
  }
};

// Implementation \uYYYY - unicode symbol code
const parseUnicodeChar: TokenParser = (token, expressions, ctx) => {
  const unicode = matchTokenSequence(token, [[TokenKind.CharEscape, { value: 'u' }], hexMatcher, hexMatcher]);
  if (!unicode.match) {
    return unmatchedToken(token, expressions);
  }

  const value = unicode.values.join('');
  assertNullable(value, ctx.reportError(token, `Can't parse value as unicode number`));

  return matchedToken(
    unicode.lastStep,
    expressions.concat(factory.createCharNode(String.fromCharCode(parseInt(value, 16)), unicode, 'unicode')),
  );
};

// Implementation \xYY - hex symbol code
const parseHexChar: TokenParser = (token, expressions, ctx) => {
  const hex = matchTokenSequence(token, [[TokenKind.CharEscape, { value: 'x' }], hexMatcher]);
  if (!hex.match) {
    return unmatchedToken(token, expressions);
  }

  const value = hex.values.at(0);
  assertNullable(value, ctx.reportError(token, `Can't parse value as hex code`));
  return matchedToken(
    hex.lastStep,
    expressions.concat(factory.createCharNode(String.fromCharCode(parseInt(value, 16)), hex, 'hex')),
  );
};

// Implementation \ddd - octal char number
const parseOctalChar: TokenParser = (token, expressions, ctx) => {
  const octal = matchTokenSequence(token, [octalMatcher]);
  if (!octal.match) {
    return unmatchedToken(token, expressions);
  }

  const value = octal.values.at(0);
  assertNullable(value, ctx.reportError(octal, "Can't parse octal value"));

  return matchedToken(
    octal.lastStep,
    expressions.concat(factory.createCharNode(String.fromCodePoint(parseInt(value, 8)), octal, 'octal')),
  );
};

// Implementation \cA - ASCII control char
const parseASCIIControlChar: TokenParser = (token, expressions, ctx) => {
  const nextToken = token.next();
  if (!nextToken || isPatternCharToken(nextToken, '/')) {
    return unmatchedToken(token, expressions);
  }

  if (!/[A-Za-z]/.test(nextToken.value)) {
    throw ctx.reportError({ start: token.start, end: nextToken.end }, 'Invalid control character');
  }
  const node = factory.createASCIIControlCharNode(nextToken.value.toUpperCase(), {
    start: token.start,
    end: nextToken.end,
  });
  return matchedToken(nextToken, expressions.concat(node));
};

// Implementation (...) - capturing group
// eslint-disable-next-line complexity
const parseCapturingGroup: TokenParser = (firstToken, parentExpressions, ctx) => {
  if (!isParenthesesOpenToken(firstToken)) {
    throw ctx.reportError(firstToken, 'Trying to parse expression as group, but got invalid input');
  }
  const parseTokenInGroup: TokenParser = (token, expressions, ctx) => {
    if (isParenthesesOpenToken(token)) {
      return forwardParser(parseCapturingGroup(token, expressions, ctx));
    }

    // Closing group
    if (isParenthesesCloseToken(token)) {
      return matchedToken(token, expressions);
    }

    if (ctx.tokenizer.isLastToken(token)) {
      throw ctx.reportError({ start: firstToken.start, end: token.end }, 'Incomplete group structure');
    }

    return parseTokenInRegexp(token, expressions, ctx, parseTokenInGroup);
  };

  let startStep: Step | null = firstToken.next();
  let specifier: GroupNameNode | null = null;
  let type: GroupNode['type'] = 'capturing';

  {
    // Implementation (?=...) - positive lookahead
    const positiveLookahead = matchTokenSequence(firstToken, [
      [TokenKind.SyntaxChar, { value: '(' }],
      [TokenKind.SyntaxChar, { value: '?' }],
      [TokenKind.PatternChar, { value: '=' }],
    ]);
    if (positiveLookahead.match) {
      startStep = positiveLookahead.lastStep.next();
      type = 'positiveLookahead';
    }
  }

  {
    // Implementation (?!...) - negative lookahead
    const negativeLookahead = matchTokenSequence(firstToken, [
      [TokenKind.SyntaxChar, { value: '(' }],
      [TokenKind.SyntaxChar, { value: '?' }],
      [TokenKind.PatternChar, { value: '!' }],
    ]);
    if (negativeLookahead.match) {
      startStep = negativeLookahead.lastStep.next();
      type = 'negativeLookahead';
    }
  }

  {
    // Implementation (?<=...) - positive lookbehind
    const positiveLookbehind = matchTokenSequence(firstToken, [
      [TokenKind.SyntaxChar, { value: '(' }],
      [TokenKind.SyntaxChar, { value: '?' }],
      [TokenKind.PatternChar, { value: '<' }],
      [TokenKind.PatternChar, { value: '=' }],
    ]);
    if (positiveLookbehind.match) {
      startStep = positiveLookbehind.lastStep.next();
      type = 'positiveLookbehind';
    }
  }

  {
    // Implementation (?<!...) - negative lookbehind
    const negativeLookbehind = matchTokenSequence(firstToken, [
      [TokenKind.SyntaxChar, { value: '(' }],
      [TokenKind.SyntaxChar, { value: '?' }],
      [TokenKind.PatternChar, { value: '<' }],
      [TokenKind.PatternChar, { value: '!' }],
    ]);
    if (negativeLookbehind.match) {
      startStep = negativeLookbehind.lastStep.next();
      type = 'negativeLookbehind';
    }
  }

  {
    // Implementation (?:...) - non-capturing group
    const nonCapturingGroup = matchTokenSequence(firstToken, [
      [TokenKind.SyntaxChar, { value: '(' }],
      [TokenKind.SyntaxChar, { value: '?' }],
      [TokenKind.PatternChar, { value: ':' }],
    ]);
    if (nonCapturingGroup.match) {
      startStep = nonCapturingGroup.lastStep.next();
      type = 'nonCapturing';
    }
  }

  {
    // Implementation (?<tag_name>...) - named capturing group
    const groupName = matchTokenSequence<string>(firstToken, [
      [TokenKind.SyntaxChar, { value: '(' }],
      [TokenKind.SyntaxChar, { value: '?' }],
      [TokenKind.PatternChar, { value: '<' }],
      wordMatcher,
      [TokenKind.PatternChar, { value: '>' }],
    ]);
    if (groupName.match) {
      const name = groupName.values.at(0);

      assertNullable(name, ctx.reportError(groupName, "Can't parse group name"));
      if (ctx.foundGroupSpecifiers.has(name)) {
        throw ctx.reportError(groupName, `Group name '${name}' is already defined`);
      }

      startStep = groupName.lastStep.next();
      specifier = factory.createGroupNameNode(name, { start: groupName.start + 2, end: groupName.end });
    }
  }

  assertNullable(startStep, ctx.reportError(firstToken, commonErrorMessages.EOL));

  const { expressions, lastStep } = fillExpressions(startStep, ctx, parseTokenInGroup);
  const node = factory.createGroupNode(type, specifier, expressions, {
    start: firstToken.start,
    end: lastStep.end,
  });

  if (specifier) {
    ctx.foundGroupSpecifiers.set(specifier.name, node);
  }

  return matchedToken(lastStep, parentExpressions.concat(node));
};

// Implementation A-z - char range
const parseCharRange: TokenParser = (token, expressions, ctx, recursiveFn = parseCharRange) => {
  const fromNode = expressions.at(-1);
  if (!fromNode) {
    return unmatchedToken(token, expressions);
  }

  const nextStep = token.next();
  assertNullable(nextStep, ctx.reportError(token, commonErrorMessages.EOL));

  const { done, value, result: nextExpressions } = recursiveFn(nextStep, [], ctx);

  if (done) {
    return unmatchedToken(token, expressions);
  }

  const toNode = nextExpressions.at(0);
  if (!toNode) {
    return unmatchedToken(token, expressions);
  }

  if (fromNode.kind !== SyntaxKind.Char) {
    throw ctx.reportError(fromNode, commonErrorMessages.UnexpectedToken);
  }

  if (toNode.kind !== SyntaxKind.Char) {
    throw ctx.reportError(toNode, commonErrorMessages.UnexpectedToken);
  }

  const fromCharCode = fromNode.value.charCodeAt(0);
  const toCharCode = toNode.value.charCodeAt(0);
  if (fromCharCode > toCharCode) {
    throw ctx.reportError(
      {
        start: fromNode.start,
        end: toNode.end,
      },
      `Character range is out of order: from '${fromNode.value}' (index ${fromCharCode}) to '${toNode.value}' (index ${toCharCode})`,
    );
  }

  expressions.pop();
  nextExpressions.shift();

  return matchedToken(value, expressions.concat([factory.createCharRangeNode(fromNode, toNode), ...nextExpressions]));
};

// Implementation [...] - char class
// Implementation [^...] - negative char class
const parseCharClass: TokenParser = (firstStep, parentExpressions, ctx) => {
  if (!isBracketsOpenToken(firstStep)) {
    throw ctx.reportError(firstStep, 'Trying to parse expression as character class, but got invalid input');
  }

  // eslint-disable-next-line complexity
  const parseTokenInCharClass: TokenParser = (token, expressions, ctx) => {
    if (isBracketsCloseToken(token)) {
      return matchedToken(token, expressions);
    } else if (ctx.tokenizer.isLastToken(token)) {
      throw ctx.reportError({ start: firstStep.start, end: token.end }, 'Character class missing closing bracket');
    }

    switch (token.kind) {
      case TokenKind.SyntaxChar:
        return forwardParser(parseSimpleChar(token, expressions, ctx));

      case TokenKind.CharEscape:
        return forwardParser(
          matchFirst(token, expressions, [
            (token, expressions) => parseBackspace(token, expressions, ctx),
            (token, expressions) => parseCharEscape(token, expressions, ctx),
          ]),
        );

      case TokenKind.CharClassEscape:
        return forwardParser(parseCharClassEscape(token, expressions, ctx));

      case TokenKind.ControlEscape:
        return forwardParser(parseControlEscapeHandler(token, expressions, ctx));

      case TokenKind.DecimalEscape:
        return forwardParser(
          matchFirst(token, expressions, [
            (token, expressions) => parseOctalChar(token, expressions, ctx),
            (token, expressions) => parseEscapedChar(token, expressions, ctx),
          ]),
        );

      case TokenKind.Decimal:
        return forwardParser(parseSimpleChar(token, expressions, ctx));

      case TokenKind.PatternChar:
        switch (token.value) {
          case '-':
            return forwardParser(
              matchFirst(token, expressions, [
                (token, expressions) => parseCharRange(token, expressions, ctx, parseTokenInCharClass),
                (token, expressions) => parseSimpleChar(token, expressions, ctx),
              ]),
            );

          default:
            return forwardParser(parseSimpleChar(token, expressions, ctx));
        }
    }
  };

  const negative = matchTokenSequence(firstStep, [
    [TokenKind.SyntaxChar, { value: '[' }],
    [TokenKind.SyntaxChar, { value: '^' }],
  ]);

  const startingStep = negative.match ? negative.lastStep.next() : firstStep.next();
  assertNullable(startingStep, ctx.reportError(firstStep, commonErrorMessages.EOL));
  const { expressions, lastStep } = fillExpressions(startingStep, ctx, parseTokenInCharClass);

  const charClassNode = factory.createCharClassNode(negative.match, expressions, {
    start: firstStep.start,
    end: lastStep.end,
  });

  return matchedToken(lastStep, parentExpressions.concat(charClassNode));
};

const parseCharEscape: TokenParser<Step<InferHandlerResult<typeof charEscapeHandler>>> = (token, expressions, ctx) => {
  switch (token.value) {
    // Implementation \xYY - hex symbol code
    case 'x': {
      return matchFirst(token, expressions, [
        (token, expressions) => parseHexChar(token, expressions, ctx),
        (token, expressions) => parseEscapedChar(token, expressions, ctx),
      ]);
    }

    case 'u': {
      return matchFirst(token, expressions, [
        (token, expressions) => parseUnicodeChar(token, expressions, ctx),
        (token, expressions) => parseEscapedChar(token, expressions, ctx),
      ]);
    }

    case 'c': {
      return matchFirst(token, expressions, [
        (token, expressions) => parseASCIIControlChar(token, expressions, ctx),
        (token, expressions) => parseEscapedChar(token, expressions, ctx),
      ]);
    }

    default:
      break;
  }

  return unmatchedToken(token, expressions);
};

const parseEscapedChar: TokenParser = (token, expressions) =>
  matchedToken(token, expressions.concat(factory.createCharNode(token.value, token, 'escaped')));

const parseSimpleChar: TokenParser = (token, expressions) =>
  matchedToken(token, expressions.concat(factory.createCharNode(token.value, token, 'simple')));

const parseCharClassEscape: TokenParser<Step<InferHandlerResult<typeof charClassEscapeHandler>>> = (
  token,
  expressions,
) => {
  switch (token.value) {
    // Implementation \d - any digit
    case 'd':
      return matchedToken(
        token,
        expressions.concat(factory.createSimpleNode<AnyDigitNode>(SyntaxKind.AnyDigit, token)),
      );
    // Implementation \D - any non digit
    case 'D':
      return matchedToken(
        token,
        expressions.concat(factory.createSimpleNode<NonDigitNode>(SyntaxKind.NonDigit, token)),
      );
    // Implementation \s - any whitespace
    case 's':
      return matchedToken(
        token,
        expressions.concat(factory.createSimpleNode<AnyWhitespaceNode>(SyntaxKind.AnyWhitespace, token)),
      );
    // Implementation \S - non whitespace
    case 'S':
      return matchedToken(
        token,
        expressions.concat(factory.createSimpleNode<NonWhitespaceNode>(SyntaxKind.NonWhitespace, token)),
      );
    // Implementation \w - any word [a-zA-Z0-9_]
    case 'w':
      return matchedToken(token, expressions.concat(factory.createSimpleNode<AnyWordNode>(SyntaxKind.AnyWord, token)));
    // Implementation \w - any non word [^a-zA-Z0-9_]
    case 'W':
      return matchedToken(token, expressions.concat(factory.createSimpleNode<NonWordNode>(SyntaxKind.NonWord, token)));
  }

  return unmatchedToken(token, expressions);
};
const parseControlEscapeHandler: TokenParser<Step<InferHandlerResult<typeof controlEscapeHandler>>> = (
  token,
  expressions,
) => {
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
  }

  return matchedToken(token, expressions.concat(factory.createControlEscapeNode(type, token)));
};

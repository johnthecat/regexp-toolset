import type { charClassEscapeHandler, charEscapeHandler, controlEscapeHandler, Step } from './regexpTokenizer.js';
import {
  isBracketsCloseToken,
  isBracketsOpenToken,
  isParenthesesCloseToken,
  isParenthesesOpenToken,
  isPatternCharToken,
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
  CarriageReturnNode,
  FormFeedCharNode,
  GroupNameNode,
  GroupNode,
  LineEndNode,
  LineStartNode,
  NewLineNode,
  NonDigitNode,
  NonWhitespaceNode,
  NonWordNode,
  NullCharNode,
  RegexpNode,
  SubpatternNode,
  TabNode,
  VerticalWhitespaceNode,
} from './regexpNodes.js';
import {
  createBackReferenceNode,
  createCharClassNode,
  createCharNode,
  createCharRangeNode,
  createControlCharNode,
  createDisjunctionNode,
  createGroupNameNode,
  createGroupNode,
  createQuantifierNode,
  createRepetitionNode,
  createSimpleNode,
  sealExpressions,
  SyntaxKind,
} from './regexpNodes.js';
import type { ParserState, PartialParser, TokenParser } from './regexpParseTypes.js';
import {
  fillExpressions,
  hexMatcher,
  matchTokenSequence,
  numberMatcher,
  octalMatcher,
  wordMatcher,
} from './regexpParseUtils.js';
import type { InferHandlerResult } from './abstract/tokenizer.js';

// TODO
// Unicode property (\p{Russian})
// Non Unicode property (\P{Russian})

const CommonErrorMessages = {
  EOL: 'Unexpected end of line',
  UnexpectedToken: 'Unexpected token',
};

export const parseRegexp = (source: string) => {
  const tokenizer = regexpTokenizer(source);
  const parserState: ParserState = {
    source,
    tokenizer,
    foundGroupSpecifiers: new Map(),
    groupSpecifierDemands: new Set(),
  };

  const firstStep = tokenizer.start();
  if (!firstStep) {
    throw new ParsingError(source, 0, source.length, "Can't parse input");
  }

  if (!isPatternCharToken(firstStep.token, '/')) {
    throw new ParsingError(source, 0, 0, 'Regexp should start with "/" symbol, like this: /.../gm');
  }

  const firstContentStep = firstStep.next();
  if (!firstContentStep) {
    throw new ParsingError(source, firstStep.token.start, source.length, "Can't parse input");
  }

  const { expressions, lastStep } = fillExpressions(firstContentStep, parserState, parseTokenInRegexp);
  if (!isPatternCharToken(lastStep.token, '/')) {
    throw new ParsingError(source, source.length, source.length, 'Regexp is not closed with "/" symbol');
  }

  const nextStep = lastStep.next();
  const regexpNode: RegexpNode = {
    kind: SyntaxKind.Regexp,
    start: 0,
    end: lastStep.token.end,
    body: sealExpressions(expressions, firstStep.token, lastStep.token),
    flags: nextStep ? parseFlags(nextStep, parserState) : '',
  };

  for (const [tag, node] of parserState.groupSpecifierDemands) {
    const found = parserState.foundGroupSpecifiers.get(tag);
    if (!found) {
      throw new ParsingError(
        source,
        node.start,
        node.end,
        `This token references a non-existent or invalid subpattern`,
      );
    }

    node.ref = found;
  }

  return regexpNode;
};

const parseFlags = (step: Step, state: ParserState): string => {
  let result = '';
  let currentStep = step;
  while (currentStep) {
    if (!isPatternCharToken(step.token)) {
      throw new ParsingError(
        state.source,
        currentStep.token.start,
        currentStep.token.end,
        CommonErrorMessages.UnexpectedToken,
      );
    }

    // TODO add flags validation
    result += currentStep.token.value;

    const nextStep = currentStep.next();
    if (!nextStep) {
      break;
    }
    currentStep = nextStep;
  }

  return result;
};

const parseQuantifierRange: PartialParser = (step, expressions, state) => {
  const { token } = step;
  const prevNode = expressions.at(-1);
  if (!prevNode) {
    throw new ParsingError(state.source, token.start, token.end, 'The preceding token is not quantifiable');
  }

  const trySequence = (step: Step, seq: Parameters<typeof matchTokenSequence<number>>[1]) => {
    const result = matchTokenSequence<number>(step, seq);

    if (result.match) {
      const from = result.values.at(0);
      const to = result.values.at(1);
      if (from === void 0) {
        throw new ParsingError(state.source, result.start, result.end, `Can't parse numeric values from range.`);
      }

      const quantifierNode = createQuantifierNode(result, {
        type: 'range',
        from,
        to,
      });

      const repetitionNode = createRepetitionNode(prevNode, quantifierNode);
      expressions.pop();
      expressions.push(repetitionNode);
    }

    return {
      match: result.match,
      lastStep: result.lastStep,
    };
  };

  const exactNumberResult = trySequence(step, [
    [TokenKind.SyntaxChar, { value: '{' }],
    numberMatcher,
    [TokenKind.SyntaxChar, { value: '}' }],
  ]);
  if (exactNumberResult.match) {
    return exactNumberResult.lastStep;
  }

  const fromNumberResult = trySequence(step, [
    [TokenKind.SyntaxChar, { value: '{' }],
    numberMatcher,
    [TokenKind.PatternChar, { value: ',' }, step => ({ match: true, step, value: Number.POSITIVE_INFINITY })],
    [TokenKind.SyntaxChar, { value: '}' }],
  ]);
  if (fromNumberResult.match) {
    return fromNumberResult.lastStep;
  }

  const fromToNumberResult = trySequence(step, [
    [TokenKind.SyntaxChar, { value: '{' }],
    numberMatcher,
    [TokenKind.PatternChar, { value: ',' }],
    numberMatcher,
    [TokenKind.SyntaxChar, { value: '}' }],
  ]);
  if (fromToNumberResult.match) {
    return fromToNumberResult.lastStep;
  }

  expressions.push(createCharNode(token.value, token, 'simple'));
  return step;
};

// eslint-disable-next-line complexity
const parseTokenInRegexp: TokenParser = (step, expressions, state, recursiveFn = parseTokenInRegexp) => {
  const { token } = step;
  switch (token.kind) {
    case TokenKind.CharClassEscape:
      return {
        shouldBreak: false,
        lastStep: parseCharClassEscape(step, expressions, state),
      };

    case TokenKind.ControlEscape:
      return {
        shouldBreak: false,
        lastStep: parseControlEscapeHandler(step, expressions, state),
      };

    case TokenKind.CharEscape:
      switch (token.value) {
        case 'k': {
          // Implementation \k<...> - subpattern match
          const subpattern = matchTokenSequence(step, [
            [TokenKind.CharEscape, { value: 'k' }],
            [TokenKind.PatternChar, { value: '<' }],
            wordMatcher,
            [TokenKind.PatternChar, { value: '>' }],
          ]);
          if (subpattern.match) {
            const groupName = subpattern.values.at(0);
            if (!groupName) {
              throw new ParsingError(state.source, subpattern.start, subpattern.end, `Can't parse subpattern name`);
            }
            const node: SubpatternNode = {
              kind: SyntaxKind.Subpattern,
              start: subpattern.start,
              end: subpattern.end,
              ref: null,
              groupName: groupName,
            };
            state.groupSpecifierDemands.add([groupName, node]);
            expressions.push(node);
            return {
              shouldBreak: false,
              lastStep: subpattern.lastStep,
            };
          }

          expressions.push(createCharNode(token.value, token, 'escaped'));
          return {
            shouldBreak: false,
            lastStep: step,
          };
        }
        default:
          return {
            shouldBreak: false,
            lastStep: parseCharEscape(step, expressions, state),
          };
      }

    case TokenKind.DecimalEscape: {
      // Implementation \ddd - octal char number
      const octal = matchTokenSequence(step, [octalMatcher]);
      if (octal.match) {
        const value = octal.values.at(0);
        if (!value) {
          throw new ParsingError(state.source, octal.start, octal.end, "Can't parse octal value");
        }

        expressions.push(createCharNode(String.fromCodePoint(parseInt(value, 8)), octal, 'octal'));
        return {
          shouldBreak: false,
          lastStep: octal.lastStep,
        };
      }

      // Implementation \0 - null char
      if (token.value === '0') {
        expressions.push(createSimpleNode<NullCharNode>(SyntaxKind.NullChar, token));
        return {
          shouldBreak: false,
          lastStep: step,
        };
      }

      // Implementation (...)\1 - back reference
      const prevNode = expressions.at(-1);
      if (token.value === '1' && prevNode && prevNode.kind === SyntaxKind.Group) {
        expressions.splice(-1, 1, createBackReferenceNode({ start: prevNode.start, end: token.end }, prevNode));
        return {
          shouldBreak: false,
          lastStep: step,
        };
      }

      expressions.push(createCharNode(token.value, token, 'escaped'));
      return {
        shouldBreak: false,
        lastStep: step,
      };
    }

    case TokenKind.PatternChar: {
      switch (token.value) {
        // End of regexp body
        case '/':
          return {
            shouldBreak: true,
            lastStep: step,
          };

        default:
          expressions.push(createCharNode(token.value, token, 'simple'));
          return {
            shouldBreak: false,
            lastStep: step,
          };
      }
    }

    case TokenKind.Decimal: {
      expressions.push(createCharNode(token.value, token, 'simple'));
      return {
        shouldBreak: false,
        lastStep: step,
      };
    }

    case TokenKind.SyntaxChar: {
      switch (token.value) {
        // Implementation [\b] - backspace
        case '[': {
          const backspace = matchTokenSequence(step, [
            [TokenKind.SyntaxChar, { value: '[' }],
            [TokenKind.CharEscape, { value: 'b' }],
            [TokenKind.SyntaxChar, { value: ']' }],
          ]);
          if (backspace.match) {
            expressions.push(createSimpleNode<BackspaceNode>(SyntaxKind.Backspace, backspace));
            return {
              shouldBreak: false,
              lastStep: backspace.lastStep,
            };
          }
          return {
            shouldBreak: false,
            lastStep: parseCharClass(step, expressions, state),
          };
        }

        // Implementation Y{1} ; Y{1,} ; Y{1,2} - range quantifier
        case '{': {
          return {
            shouldBreak: false,
            lastStep: parseQuantifierRange(step, expressions, state),
          };
        }

        // Implementation (...) - capturing group
        case '(': {
          return {
            shouldBreak: false,
            lastStep: parseCapturingGroup(step, expressions, state),
          };
        }

        // Implementation ^... - line start
        case '^': {
          expressions.push(createSimpleNode<LineStartNode>(SyntaxKind.LineStart, token));
          return {
            shouldBreak: false,
            lastStep: step,
          };
        }

        // Implementation ...$ - line end
        case '$':
          expressions.push(createSimpleNode<LineEndNode>(SyntaxKind.LineEnd, token));
          return {
            shouldBreak: false,
            lastStep: step,
          };

        // Implementation . - any character
        case '.':
          expressions.push(createSimpleNode<AnyCharNode>(SyntaxKind.AnyChar, token));
          return {
            shouldBreak: false,
            lastStep: step,
          };

        // Implementation .* ; .+ ; .? - quantifiers
        case '*':
        case '+':
        case '?': {
          const prevNode = expressions.at(-1);
          if (!prevNode) {
            throw new ParsingError(state.source, token.start, token.end, 'The preceding token is not quantifiable');
          }

          const lazy = matchTokenSequence(step, [TokenKind.SyntaxChar, [TokenKind.SyntaxChar, { value: '?' }]]);
          const quantifierNode = createQuantifierNode(token, {
            type: token.value === '?' ? 'zeroOrOne' : token.value === '+' ? 'zeroOrMany' : 'oneOrMany',
            greedy: !lazy.match,
          });
          expressions.pop();
          expressions.push(createRepetitionNode(prevNode, quantifierNode));
          return {
            shouldBreak: false,
            lastStep: lazy.match ? lazy.lastStep : step,
          };
        }

        // Implementation .|. - disjunction
        case '|': {
          const leftNodes = expressions.splice(0, expressions.length);
          const nextStep = step.next();

          if (!nextStep) {
            expressions.push(createDisjunctionNode(leftNodes, [], token));
            return {
              shouldBreak: true,
              lastStep: step,
            };
          }

          const { expressions: rightNodes, lastStep } = fillExpressions(nextStep, state, recursiveFn);
          expressions.push(createDisjunctionNode(leftNodes, rightNodes, token));
          return {
            shouldBreak: true,
            lastStep,
          };
        }

        case ')':
          throw new ParsingError(state.source, step.token.start, step.token.end, 'Unmatched parenthesis');

        default:
          throw new ParsingError(state.source, step.token.start, step.token.end, CommonErrorMessages.UnexpectedToken);
      }
    }
  }
};

// eslint-disable-next-line complexity
const parseCapturingGroup: PartialParser = (firstStep, parentExpressions, state) => {
  const { source } = state;

  if (!isParenthesesOpenToken(firstStep.token)) {
    throw new ParsingError(
      source,
      firstStep.token.start,
      firstStep.token.end,
      'Trying to parse expression as group, but got invalid input',
    );
  }
  const parseTokenInGroup: TokenParser = (step, expressions, state) => {
    const { token } = step;

    if (state.tokenizer.isLastToken(token) && !isParenthesesCloseToken(token)) {
      throw new ParsingError(state.source, firstStep.token.start, token.end, 'Group is not closed');
    }

    switch (token.kind) {
      case TokenKind.SyntaxChar: {
        switch (token.value) {
          case '(': {
            const lastStep = parseCapturingGroup(step, expressions, state);
            if (!lastStep) {
              throw new ParsingError(state.source, firstStep.token.start, firstStep.token.end, CommonErrorMessages.EOL);
            }
            return {
              shouldBreak: false,
              lastStep,
            };
          }
          // Skipping closing bracket
          case ')':
            return {
              shouldBreak: true,
              lastStep: step,
            };

          default:
            if (state.tokenizer.isLastToken(token)) {
              throw new ParsingError(state.source, firstStep.token.start, token.end, 'Group is not closed');
            }
            return parseTokenInRegexp(step, expressions, state, parseTokenInGroup);
        }
      }

      default:
        if (state.tokenizer.isLastToken(token)) {
          throw new ParsingError(state.source, firstStep.token.start, token.end, 'Incomplete group structure');
        }
        return parseTokenInRegexp(step, expressions, state, parseTokenInGroup);
    }
  };

  let startStep: Step | null = firstStep.next();
  let specifier: GroupNameNode | null = null;
  let type: GroupNode['type'] = 'capturing';

  {
    // Implementation (?=...) - positive lookahead
    const positiveLookahead = matchTokenSequence(firstStep, [
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
    const negativeLookahead = matchTokenSequence(firstStep, [
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
    const positiveLookbehind = matchTokenSequence(firstStep, [
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
    const negativeLookbehind = matchTokenSequence(firstStep, [
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
    const nonCapturingGroup = matchTokenSequence(firstStep, [
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
    const groupName = matchTokenSequence<string>(firstStep, [
      [TokenKind.SyntaxChar, { value: '(' }],
      [TokenKind.SyntaxChar, { value: '?' }],
      [TokenKind.PatternChar, { value: '<' }],
      wordMatcher,
      [TokenKind.PatternChar, { value: '>' }],
    ]);
    if (groupName.match) {
      const name = groupName.values.at(0);
      if (!name) {
        throw new ParsingError(source, groupName.start, groupName.end, `Can't parse group name`);
      }
      if (state.foundGroupSpecifiers.has(name)) {
        throw new ParsingError(source, groupName.start, groupName.end, `This group name is already defined`);
      }

      startStep = groupName.lastStep.next();
      specifier = createGroupNameNode(name, { start: groupName.start + 2, end: groupName.end });
    }
  }

  if (!startStep) {
    throw new ParsingError(source, source.length - 1, source.length, CommonErrorMessages.EOL);
  }

  const { expressions, lastStep } = fillExpressions(startStep, state, parseTokenInGroup);
  const node = createGroupNode(type, specifier, expressions, {
    start: firstStep.token.start,
    end: lastStep.token.end,
  });

  if (specifier) {
    state.foundGroupSpecifiers.set(specifier.name, node);
  }

  parentExpressions.push(node);
  return lastStep;
};

const parseCharClass: PartialParser = (firstStep, parentExpressions, state) => {
  if (!isBracketsOpenToken(firstStep.token)) {
    throw new ParsingError(
      state.source,
      firstStep.token.start,
      firstStep.token.end,
      'Trying to parse expression as character class, but got invalid input',
    );
  }

  // eslint-disable-next-line complexity
  const parseTokenInCharClass: TokenParser = (step, expressions, state) => {
    const { source } = state;
    const { token } = step;

    if (isBracketsCloseToken(token)) {
      return {
        shouldBreak: true,
        lastStep: step,
      };
    } else if (state.tokenizer.isLastToken(token)) {
      throw new ParsingError(source, firstStep.token.start, token.end, 'Character class missing closing bracket');
    }

    switch (token.kind) {
      case TokenKind.SyntaxChar:
        expressions.push(createCharNode(token.value, token, 'simple'));
        return {
          shouldBreak: false,
          lastStep: step,
        };

      case TokenKind.CharEscape:
        return {
          shouldBreak: false,
          lastStep: parseCharEscape(step, expressions, state),
        };

      case TokenKind.CharClassEscape:
        return {
          shouldBreak: false,
          lastStep: parseCharClassEscape(step, expressions, state),
        };

      case TokenKind.ControlEscape:
        return {
          shouldBreak: false,
          lastStep: parseControlEscapeHandler(step, expressions, state),
        };

      case TokenKind.DecimalEscape:
        expressions.push(createCharNode(token.value, token, 'escaped'));
        return {
          shouldBreak: false,
          lastStep: step,
        };

      case TokenKind.Decimal:
        expressions.push(createCharNode(token.value, token, 'simple'));
        return {
          shouldBreak: false,
          lastStep: step,
        };

      case TokenKind.PatternChar:
        switch (token.value) {
          // Implementation A-z - char range
          case '-': {
            const fromNode = expressions.pop();
            if (!fromNode) {
              expressions.push(createCharNode(token.value, token, 'simple'));
              return {
                shouldBreak: false,
                lastStep: step,
              };
            }

            const nextStep = step.next();
            if (!nextStep) {
              throw new ParsingError(source, token.start, token.end, CommonErrorMessages.EOL);
            }

            const nextExpressions: AnyRegexpNode[] = [];
            const { shouldBreak, lastStep } = parseTokenInCharClass(nextStep, nextExpressions, state);

            if (shouldBreak) {
              expressions.push(fromNode, createCharNode(token.value, token, 'simple'));
              return {
                shouldBreak: false,
                lastStep: step,
              };
            }

            const toNode = nextExpressions.shift();
            if (!toNode) {
              expressions.push(fromNode, createCharNode(token.value, token, 'simple'));
              return {
                shouldBreak: false,
                lastStep: step,
              };
            }

            if (fromNode.kind !== SyntaxKind.Char) {
              throw new ParsingError(source, fromNode.start, fromNode.end, CommonErrorMessages.UnexpectedToken);
            }

            if (toNode.kind !== SyntaxKind.Char) {
              throw new ParsingError(source, toNode.start, toNode.end, CommonErrorMessages.UnexpectedToken);
            }

            const fromCharCode = fromNode.value.charCodeAt(0);
            const toCharCode = toNode.value.charCodeAt(0);
            if (fromCharCode > toCharCode) {
              throw new ParsingError(
                source,
                fromNode.start,
                toNode.end,
                `Character range is out of order: from '${fromNode.value}' (index ${fromCharCode}) to '${toNode.value}' (index ${toCharCode})`,
              );
            }

            expressions.push(createCharRangeNode(fromNode, toNode));
            expressions.push(...nextExpressions);
            return {
              shouldBreak: false,
              lastStep,
            };
          }

          default:
            expressions.push(createCharNode(token.value, token, 'simple'));
            return {
              shouldBreak: false,
              lastStep: step,
            };
        }
    }
  };

  // Implementation [^...] - negative char class
  const negative = matchTokenSequence(firstStep, [
    [TokenKind.SyntaxChar, { value: '[' }],
    [TokenKind.SyntaxChar, { value: '^' }],
  ]);

  const startingStep = negative.match ? negative.lastStep.next() : firstStep.next();
  if (!startingStep) {
    throw new ParsingError(state.source, state.source.length - 1, state.source.length, CommonErrorMessages.EOL);
  }

  const { expressions, lastStep } = fillExpressions(startingStep, state, parseTokenInCharClass);

  // Implementation [...] - char class
  const charClassNode = createCharClassNode(negative.match, expressions, {
    start: firstStep.token.start,
    end: lastStep?.token.end,
  });

  parentExpressions.push(charClassNode);
  return lastStep;
};

const parseCharEscape: PartialParser<InferHandlerResult<typeof charEscapeHandler>> = (step, expressions, state) => {
  const { token } = step;
  switch (token.value) {
    // Implementation \xYY - hex symbol code
    case 'x': {
      const hex = matchTokenSequence(step, [[TokenKind.CharEscape, { value: 'x' }], hexMatcher]);
      if (hex.match) {
        const value = hex.values.at(0);
        if (!value) {
          throw new ParsingError(state.source, token.start, token.end, `Can't parse value as hex code`);
        }
        expressions.push(createCharNode(String.fromCharCode(parseInt(value, 16)), hex, 'hex'));
        return hex.lastStep;
      }
      expressions.push(createCharNode(token.value, token, 'escaped'));
      return step;
    }

    // Implementation \uYYYY - unicode symbol code
    case 'u': {
      const hex = matchTokenSequence(step, [[TokenKind.CharEscape, { value: 'u' }], hexMatcher, hexMatcher]);
      if (hex.match) {
        const value = hex.values.join('');
        if (!value) {
          throw new ParsingError(state.source, token.start, token.end, `Can't parse value as unicode number`);
        }
        expressions.push(createCharNode(String.fromCodePoint(parseInt(value, 16)), hex, 'unicode'));
        return hex.lastStep;
      }
      expressions.push(createCharNode(token.value, token, 'escaped'));
      return step;
    }

    // Implementation \cA - control char
    case 'c': {
      const nextStep = step.next();
      if (!nextStep) {
        expressions.push(createCharNode(token.value, token, 'escaped'));
        return step;
      }

      if (!/[A-Za-z]/.test(nextStep.token.value)) {
        throw new ParsingError(state.source, token.start, nextStep.token.end, 'Invalid control character');
      }

      const node = createControlCharNode(nextStep.token.value.toUpperCase(), {
        start: token.start,
        end: nextStep.token.end,
      });
      expressions.push(node);
      return nextStep;
    }

    default:
      expressions.push(createCharNode(token.value, token, 'escaped'));
      return step;
  }
};

const parseCharClassEscape: PartialParser<InferHandlerResult<typeof charClassEscapeHandler>> = (step, expressions) => {
  const { token } = step;
  switch (token.value) {
    case 'd':
      // Implementation \d - any digit
      expressions.push(createSimpleNode<AnyDigitNode>(SyntaxKind.AnyDigit, token));
      return step;
    case 'D':
      // Implementation \D - any non digit
      expressions.push(createSimpleNode<NonDigitNode>(SyntaxKind.NonDigit, token));
      return step;
    case 's':
      // Implementation \s - any whitespace
      expressions.push(createSimpleNode<AnyWhitespaceNode>(SyntaxKind.AnyWhitespace, token));
      return step;
    case 'S':
      // Implementation \S - any non whitespace
      expressions.push(createSimpleNode<NonWhitespaceNode>(SyntaxKind.NonWhitespace, token));
      return step;
    case 'w':
      // Implementation \w - any word [a-zA-Z0-9_]
      expressions.push(createSimpleNode<AnyWordNode>(SyntaxKind.AnyWord, token));
      return step;
    case 'W':
      // Implementation \w - any non word [^a-zA-Z0-9_]
      expressions.push(createSimpleNode<NonWordNode>(SyntaxKind.NonWord, token));
      return step;
  }
};
const parseControlEscapeHandler: PartialParser<InferHandlerResult<typeof controlEscapeHandler>> = (
  step,
  expressions,
) => {
  const { token } = step;
  switch (token.value) {
    // Implementation \n - new line
    case 'n':
      expressions.push(createSimpleNode<NewLineNode>(SyntaxKind.NewLine, token));
      return step;
    // Implementation \r - carriage return
    case 'r':
      expressions.push(createSimpleNode<CarriageReturnNode>(SyntaxKind.CarriageReturn, token));
      return step;
    // Implementation \t - tab
    case 't':
      expressions.push(createSimpleNode<TabNode>(SyntaxKind.Tab, token));
      return step;
    // Implementation \v - vertical whitespace
    case 'v':
      expressions.push(createSimpleNode<VerticalWhitespaceNode>(SyntaxKind.VerticalWhitespace, token));
      return step;
    case 'f':
      expressions.push(createSimpleNode<FormFeedCharNode>(SyntaxKind.FormFeedChar, token));
      return step;
  }
};

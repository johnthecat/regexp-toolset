import type { charEscapeHandler, controlEscapeHandler, Step, charClassEscapeHandler } from './regexpTokenizer.js';
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
  SubpatternNode,
  TabNode,
  VerticalWhitespaceNode,
} from './regexpNodes.js';
import { SyntaxKind } from './regexpNodes.js';
import * as factory from './regexpNodeFactory.js';
import { createRegexpNode } from './regexpNodeFactory.js';
import type { ParserContext, TokenParser } from './regexpParseTypes.js';
import {
  fillExpressions,
  hexMatcher,
  matchTokenSequence,
  numberMatcher,
  octalMatcher,
  sealExpressions,
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

export const parseRegexp = (source: string) => {
  const tokenizer = regexpTokenizer(source);
  const parserCtx: ParserContext = {
    source,
    tokenizer,
    foundGroupSpecifiers: new Map(),
    groupSpecifierDemands: new Set(),
    reportError: (position, message) => {
      return new ParsingError(source, position.start, position.end, message);
    },
  };

  const firstStep = tokenizer.getFirstStep();
  if (!firstStep) {
    throw new ParsingError(source, 0, source.length, "Can't parse input");
  }

  if (!isPatternCharToken(firstStep, '/')) {
    throw new ParsingError(source, 0, 0, 'Regexp should start with "/" symbol, like this: /.../gm');
  }

  const firstContentStep = firstStep.next();
  if (!firstContentStep) {
    throw new ParsingError(source, firstStep.start, source.length, "Can't parse input");
  }

  const { expressions, lastStep } = fillExpressions(firstContentStep, parserCtx, parseTokenInRegexp);
  if (!isPatternCharToken(lastStep, '/')) {
    throw new ParsingError(source, source.length, source.length, 'Regexp is not closed with "/" symbol');
  }

  const nextStep = lastStep.next();
  const regexpNode = createRegexpNode(expressions, nextStep ? parseFlags(nextStep, parserCtx) : '');

  for (const [tag, node] of parserCtx.groupSpecifierDemands) {
    const found = parserCtx.foundGroupSpecifiers.get(tag);
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

export const parseRegexpNode = (source: string): AnyRegexpNode => {
  const tokenizer = regexpTokenizer(source);
  const parserCtx: ParserContext = {
    source,
    tokenizer,
    foundGroupSpecifiers: new Map(),
    groupSpecifierDemands: new Set(),
    reportError: (position, message) => {
      return new ParsingError(source, position.start, position.end, message);
    },
  };

  const firstStep = tokenizer.getFirstStep();
  if (!firstStep) {
    throw new ParsingError(source, 0, source.length, "Can't parse input");
  }

  const { expressions, lastStep } = fillExpressions(firstStep, parserCtx, parseTokenInRegexp);

  for (const [tag, node] of parserCtx.groupSpecifierDemands) {
    const found = parserCtx.foundGroupSpecifiers.get(tag);
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

  return sealExpressions(expressions, firstStep, lastStep);
};

const parseFlags = (step: Step, ctx: ParserContext): string => {
  let result = '';
  let currentStep = step;
  while (currentStep) {
    if (!isPatternCharToken(step)) {
      throw ctx.reportError(currentStep, commonErrorMessages.UnexpectedToken);
    }

    // TODO add flags validation
    result += currentStep.value;

    const nextStep = currentStep.next();
    if (!nextStep) {
      break;
    }
    currentStep = nextStep;
  }

  return result;
};

const parseQuantifierRange: TokenParser = (token, expressions, ctx) => {
  const prevNode = expressions.at(-1);
  if (!prevNode) {
    throw ctx.reportError(token, 'The preceding token is not quantifiable');
  }

  const trySequence = (step: Step, seq: Parameters<typeof matchTokenSequence<number>>[1]) => {
    const range = matchTokenSequence<number>(step, seq);
    const lazy = matchTokenSequence(range.lastStep, [TokenKind.SyntaxChar, [TokenKind.SyntaxChar, { value: '?' }]]);

    if (range.match) {
      const from = range.values.at(0);
      const to = range.values.at(1);
      if (from === void 0) {
        throw ctx.reportError(range, "Can't parse numeric values from range.");
      }
      expressions.pop();

      const quantifierNode = factory.createQuantifierNode(range, {
        greedy: !lazy.match,
        type: 'range',
        from,
        to,
      });

      const repetitionNode = factory.createRepetitionNode(prevNode, quantifierNode);
      expressions.push(repetitionNode);
    }

    return {
      match: range.match,
      value: lazy.match ? lazy.lastStep : range.lastStep,
    };
  };

  {
    const exactNumberResult = trySequence(token, [
      [TokenKind.SyntaxChar, { value: '{' }],
      numberMatcher,
      [TokenKind.SyntaxChar, { value: '}' }],
    ]);
    if (exactNumberResult.match) {
      return {
        done: true,
        value: exactNumberResult.value,
        result: expressions,
      };
    }
  }

  {
    const fromNumberResult = trySequence(token, [
      [TokenKind.SyntaxChar, { value: '{' }],
      numberMatcher,
      [TokenKind.PatternChar, { value: ',' }, step => ({ match: true, step, value: Number.POSITIVE_INFINITY })],
      [TokenKind.SyntaxChar, { value: '}' }],
    ]);
    if (fromNumberResult.match) {
      return {
        done: true,
        value: fromNumberResult.value,
        result: expressions,
      };
    }
  }

  {
    const fromToNumberResult = trySequence(token, [
      [TokenKind.SyntaxChar, { value: '{' }],
      numberMatcher,
      [TokenKind.PatternChar, { value: ',' }],
      numberMatcher,
      [TokenKind.SyntaxChar, { value: '}' }],
    ]);
    if (fromToNumberResult.match) {
      return {
        done: true,
        value: fromToNumberResult.value,
        result: expressions,
      };
    }
  }

  return {
    done: true,
    value: token,
    result: expressions.concat(factory.createCharNode(token.value, token, 'simple')),
  };
};

// eslint-disable-next-line complexity
const parseTokenInRegexp: TokenParser = (token, expressions, ctx, recursiveFn = parseTokenInRegexp) => {
  switch (token.kind) {
    case TokenKind.CharClassEscape:
      return {
        ...parseCharClassEscape(token, expressions, ctx),
        done: false,
      };

    case TokenKind.ControlEscape:
      return {
        ...parseControlEscapeHandler(token, expressions, ctx),
        done: false,
      };

    case TokenKind.CharEscape:
      switch (token.value) {
        case 'k': {
          // Implementation \k<...> - subpattern match
          const subpattern = matchTokenSequence(token, [
            [TokenKind.CharEscape, { value: 'k' }],
            [TokenKind.PatternChar, { value: '<' }],
            wordMatcher,
            [TokenKind.PatternChar, { value: '>' }],
          ]);
          if (subpattern.match) {
            const groupName = subpattern.values.at(0);
            if (!groupName) {
              throw ctx.reportError(subpattern, `Can't parse subpattern name`);
            }
            const node: SubpatternNode = {
              kind: SyntaxKind.Subpattern,
              start: subpattern.start,
              end: subpattern.end,
              ref: null,
              groupName: groupName,
            };
            ctx.groupSpecifierDemands.add([groupName, node]);
            return {
              done: false,
              value: subpattern.lastStep,
              result: expressions.concat(node),
            };
          }

          return {
            done: false,
            value: token,
            result: expressions.concat(factory.createCharNode(token.value, token, 'escaped')),
          };
        }
        default:
          return {
            ...parseCharEscape(token, expressions, ctx),
            done: false,
          };
      }

    case TokenKind.DecimalEscape: {
      // Implementation \ddd - octal char number
      const octal = matchTokenSequence(token, [octalMatcher]);
      if (octal.match) {
        const value = octal.values.at(0);
        if (!value) {
          throw ctx.reportError(octal, "Can't parse octal value");
        }

        return {
          done: false,
          value: octal.lastStep,
          result: expressions.concat(factory.createCharNode(String.fromCodePoint(parseInt(value, 8)), octal, 'octal')),
        };
      }

      // Implementation \0 - null char
      if (token.value === '0') {
        return {
          done: false,
          value: token,
          result: expressions.concat(factory.createSimpleNode<NullCharNode>(SyntaxKind.NullChar, token)),
        };
      }

      // Implementation (...)\1 - back reference
      const prevNode = expressions.at(-1);
      if (token.value === '1' && prevNode && prevNode.kind === SyntaxKind.Group) {
        expressions.splice(-1, 1, factory.createBackReferenceNode({ start: prevNode.start, end: token.end }, prevNode));
        return {
          done: false,
          value: token,
          result: expressions,
        };
      }

      return {
        done: false,
        value: token,
        result: expressions.concat(factory.createCharNode(token.value, token, 'escaped')),
      };
    }

    case TokenKind.PatternChar: {
      switch (token.value) {
        // End of regexp body
        case '/':
          return {
            done: true,
            value: token,
            result: expressions,
          };

        default:
          return {
            done: false,
            value: token,
            result: expressions.concat(factory.createCharNode(token.value, token, 'simple')),
          };
      }
    }

    case TokenKind.Decimal: {
      return {
        done: false,
        value: token,
        result: expressions.concat(factory.createCharNode(token.value, token, 'simple')),
      };
    }

    case TokenKind.SyntaxChar: {
      switch (token.value) {
        case '[': {
          // Implementation [\b] - backspace
          const backspace = matchTokenSequence(token, [
            [TokenKind.SyntaxChar, { value: '[' }],
            [TokenKind.CharEscape, { value: 'b' }],
            [TokenKind.SyntaxChar, { value: ']' }],
          ]);
          if (backspace.match) {
            return {
              done: false,
              value: backspace.lastStep,
              result: expressions.concat(factory.createSimpleNode<BackspaceNode>(SyntaxKind.Backspace, backspace)),
            };
          }
          return {
            ...parseCharClass(token, expressions, ctx),
            done: false,
          };
        }

        // Implementation Y{1} ; Y{1,} ; Y{1,2} - range quantifier
        case '{': {
          return {
            ...parseQuantifierRange(token, expressions, ctx),
            done: false,
          };
        }

        // Implementation (...) - capturing group
        case '(': {
          return {
            ...parseCapturingGroup(token, expressions, ctx),
            done: false,
          };
        }

        // Implementation ^... - line start
        case '^': {
          return {
            done: false,
            value: token,
            result: expressions.concat(factory.createSimpleNode<LineStartNode>(SyntaxKind.LineStart, token)),
          };
        }

        // Implementation ...$ - line end
        case '$':
          return {
            done: false,
            value: token,
            result: expressions.concat(factory.createSimpleNode<LineEndNode>(SyntaxKind.LineEnd, token)),
          };

        // Implementation . - any character
        case '.':
          return {
            done: false,
            value: token,
            result: expressions.concat(factory.createSimpleNode<AnyCharNode>(SyntaxKind.AnyChar, token)),
          };

        // Implementation .* ; .+ ; .? - quantifiers
        case '*':
        case '+':
        case '?': {
          const prevNode = expressions.at(-1);
          if (!prevNode) {
            throw ctx.reportError(token, 'The preceding token is not quantifiable');
          }

          const lazy = matchTokenSequence(token, [TokenKind.SyntaxChar, [TokenKind.SyntaxChar, { value: '?' }]]);
          const quantifierNode = factory.createQuantifierNode(lazy.match ? lazy : token, {
            type: token.value === '?' ? 'zeroOrOne' : token.value === '+' ? 'zeroOrMany' : 'oneOrMany',
            greedy: !lazy.match,
          });
          // TODO rework
          expressions.pop();
          return {
            done: false,
            value: lazy.match ? lazy.lastStep : token,
            result: expressions.concat(factory.createRepetitionNode(prevNode, quantifierNode)),
          };
        }

        // Implementation .|. - disjunction
        case '|': {
          const leftNodes = expressions.splice(0, expressions.length);
          const nextStep = token.next();

          if (!nextStep) {
            return {
              done: true,
              value: token,
              result: expressions.concat(factory.createDisjunctionNode(leftNodes, [], token)),
            };
          }

          const { expressions: rightNodes, lastStep } = fillExpressions(nextStep, ctx, recursiveFn);
          return {
            done: true,
            value: lastStep,
            result: expressions.concat(factory.createDisjunctionNode(leftNodes, rightNodes, token)),
          };
        }

        case ')':
          throw ctx.reportError(token, 'Unmatched parenthesis');

        default:
          throw ctx.reportError(token, commonErrorMessages.UnexpectedToken);
      }
    }
  }
};

// eslint-disable-next-line complexity
const parseCapturingGroup: TokenParser = (firstStep, parentExpressions, ctx) => {
  if (!isParenthesesOpenToken(firstStep)) {
    throw ctx.reportError(firstStep, 'Trying to parse expression as group, but got invalid input');
  }
  const parseTokenInGroup: TokenParser = (token, expressions, ctx) => {
    if (ctx.tokenizer.isLastToken(token) && !isParenthesesCloseToken(token)) {
      throw ctx.reportError({ start: firstStep.start, end: token.end }, 'Group is not closed');
    }

    switch (token.kind) {
      case TokenKind.SyntaxChar: {
        switch (token.value) {
          case '(':
            return {
              ...parseCapturingGroup(token, expressions, ctx),
              done: false,
            };

          // Skipping closing bracket
          case ')':
            return {
              done: true,
              value: token,
              result: expressions,
            };

          default:
            break;
        }
        break;
      }

      default:
        break;
    }

    if (ctx.tokenizer.isLastToken(token)) {
      throw ctx.reportError({ start: firstStep.start, end: token.end }, 'Incomplete group structure');
    }
    return parseTokenInRegexp(token, expressions, ctx, parseTokenInGroup);
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
        throw ctx.reportError(groupName, "Can't parse group name");
      }
      if (ctx.foundGroupSpecifiers.has(name)) {
        throw ctx.reportError(groupName, 'This group name is already defined');
      }

      startStep = groupName.lastStep.next();
      specifier = factory.createGroupNameNode(name, { start: groupName.start + 2, end: groupName.end });
    }
  }

  if (!startStep) {
    throw ctx.reportError(firstStep, commonErrorMessages.EOL);
  }

  const { expressions, lastStep } = fillExpressions(startStep, ctx, parseTokenInGroup);
  const node = factory.createGroupNode(type, specifier, expressions, {
    start: firstStep.start,
    end: lastStep.end,
  });

  if (specifier) {
    ctx.foundGroupSpecifiers.set(specifier.name, node);
  }

  return {
    done: true,
    value: lastStep,
    result: parentExpressions.concat(node),
  };
};

const parseCharClass: TokenParser = (firstStep, parentExpressions, ctx) => {
  if (!isBracketsOpenToken(firstStep)) {
    throw ctx.reportError(firstStep, 'Trying to parse expression as character class, but got invalid input');
  }

  // eslint-disable-next-line complexity
  const parseTokenInCharClass: TokenParser = (token, expressions, ctx) => {
    if (isBracketsCloseToken(token)) {
      return {
        done: true,
        result: expressions,
        value: token,
      };
    } else if (ctx.tokenizer.isLastToken(token)) {
      throw ctx.reportError({ start: firstStep.start, end: token.end }, 'Character class missing closing bracket');
    }

    switch (token.kind) {
      case TokenKind.SyntaxChar:
        return {
          done: false,
          result: expressions.concat(factory.createCharNode(token.value, token, 'simple')),
          value: token,
        };

      case TokenKind.CharEscape:
        return {
          ...parseCharEscape(token, expressions, ctx),
          done: false,
        };

      case TokenKind.CharClassEscape:
        return {
          ...parseCharClassEscape(token, expressions, ctx),
          done: false,
        };

      case TokenKind.ControlEscape:
        return {
          ...parseControlEscapeHandler(token, expressions, ctx),
          done: false,
        };

      case TokenKind.DecimalEscape:
        return {
          done: false,
          value: token,
          result: expressions.concat(factory.createCharNode(token.value, token, 'escaped')),
        };

      case TokenKind.Decimal:
        return {
          done: false,
          value: token,
          result: expressions.concat(factory.createCharNode(token.value, token, 'simple')),
        };

      case TokenKind.PatternChar:
        switch (token.value) {
          // Implementation A-z - char range
          case '-': {
            const fromNode = expressions.pop();
            if (!fromNode) {
              return {
                done: false,
                value: token,
                result: expressions.concat(factory.createCharNode(token.value, token, 'simple')),
              };
            }

            const nextStep = token.next();
            if (!nextStep) {
              throw ctx.reportError(token, commonErrorMessages.EOL);
            }

            const { done, value, result: nextExpressions } = parseTokenInCharClass(nextStep, [], ctx);

            if (done) {
              return {
                done: false,
                value: token,
                result: expressions.concat(fromNode, factory.createCharNode(token.value, token, 'simple')),
              };
            }

            const toNode = nextExpressions.shift();
            if (!toNode) {
              return {
                done: false,
                value: token,
                result: expressions.concat(factory.createCharNode(token.value, token, 'simple')),
              };
            }

            // TODO relax checks
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

            return {
              done: false,
              value,
              result: expressions.concat([factory.createCharRangeNode(fromNode, toNode), ...nextExpressions]),
            };
          }

          default:
            return {
              done: false,
              value: token,
              result: expressions.concat(factory.createCharNode(token.value, token, 'simple')),
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
    throw ctx.reportError(firstStep, commonErrorMessages.EOL);
  }

  const { expressions, lastStep } = fillExpressions(startingStep, ctx, parseTokenInCharClass);

  // Implementation [...] - char class
  const charClassNode = factory.createCharClassNode(negative.match, expressions, {
    start: firstStep.start,
    end: lastStep.end,
  });

  return {
    done: true,
    value: lastStep,
    result: parentExpressions.concat(charClassNode),
  };
};

const parseCharEscape: TokenParser<Step<InferHandlerResult<typeof charEscapeHandler>>> = (token, expressions, ctx) => {
  switch (token.value) {
    // Implementation \xYY - hex symbol code
    case 'x': {
      const hex = matchTokenSequence(token, [[TokenKind.CharEscape, { value: 'x' }], hexMatcher]);
      if (hex.match) {
        const value = hex.values.at(0);
        if (!value) {
          throw ctx.reportError(token, `Can't parse value as hex code`);
        }
        return {
          done: true,
          value: hex.lastStep,
          result: expressions.concat(factory.createCharNode(String.fromCharCode(parseInt(value, 16)), hex, 'hex')),
        };
      }
      break;
    }

    // Implementation \uYYYY - unicode symbol code
    case 'u': {
      const unicode = matchTokenSequence(token, [[TokenKind.CharEscape, { value: 'u' }], hexMatcher, hexMatcher]);
      if (unicode.match) {
        const value = unicode.values.join('');
        if (!value) {
          throw ctx.reportError(token, `Can't parse value as unicode number`);
        }
        return {
          done: true,
          value: unicode.lastStep,
          result: expressions.concat(
            factory.createCharNode(String.fromCharCode(parseInt(value, 16)), unicode, 'unicode'),
          ),
        };
      }
      break;
    }

    // Implementation \cA - control char
    case 'c': {
      const nextStep = token.next();
      if (nextStep) {
        if (!/[A-Za-z]/.test(nextStep.value)) {
          throw ctx.reportError(token, 'Invalid control character');
        }
        const node = factory.createControlCharNode(nextStep.value.toUpperCase(), {
          start: token.start,
          end: nextStep.end,
        });
        expressions.push(node);
        return {
          done: true,
          value: token,
          result: expressions.concat(node),
        };
      }
      break;
    }

    default:
      break;
  }

  return {
    done: true,
    value: token,
    result: expressions.concat(factory.createCharNode(token.value, token, 'escaped')),
  };
};

const parseCharClassEscape: TokenParser<Step<InferHandlerResult<typeof charClassEscapeHandler>>> = (
  token,
  expressions,
) => {
  switch (token.value) {
    // Implementation \d - any digit
    case 'd':
      return {
        done: true,
        value: token,
        result: expressions.concat(factory.createSimpleNode<AnyDigitNode>(SyntaxKind.AnyDigit, token)),
      };
    // Implementation \D - any non digit
    case 'D':
      return {
        done: true,
        value: token,
        result: expressions.concat(factory.createSimpleNode<NonDigitNode>(SyntaxKind.NonDigit, token)),
      };
    // Implementation \s - any whitespace
    case 's':
      return {
        done: true,
        value: token,
        result: expressions.concat(factory.createSimpleNode<AnyWhitespaceNode>(SyntaxKind.AnyWhitespace, token)),
      };
    // Implementation \S - non whitespace
    case 'S':
      return {
        done: true,
        value: token,
        result: expressions.concat(factory.createSimpleNode<NonWhitespaceNode>(SyntaxKind.NonWhitespace, token)),
      };
    // Implementation \w - any word [a-zA-Z0-9_]
    case 'w':
      return {
        done: true,
        value: token,
        result: expressions.concat(factory.createSimpleNode<AnyWordNode>(SyntaxKind.AnyWord, token)),
      };
    // Implementation \w - any non word [^a-zA-Z0-9_]
    case 'W':
      return {
        done: true,
        value: token,
        result: expressions.concat(factory.createSimpleNode<NonWordNode>(SyntaxKind.NonWord, token)),
      };
  }
};
const parseControlEscapeHandler: TokenParser<Step<InferHandlerResult<typeof controlEscapeHandler>>> = (
  token,
  expressions,
) => {
  switch (token.value) {
    // Implementation \n - new line
    case 'n':
      return {
        done: true,
        value: token,
        result: expressions.concat(factory.createSimpleNode<NewLineNode>(SyntaxKind.NewLine, token)),
      };
    // Implementation \r - carriage return
    case 'r':
      return {
        done: true,
        value: token,
        result: expressions.concat(factory.createSimpleNode<CarriageReturnNode>(SyntaxKind.CarriageReturn, token)),
      };
    // Implementation \t - tab
    case 't':
      return {
        done: true,
        value: token,
        result: expressions.concat(factory.createSimpleNode<TabNode>(SyntaxKind.Tab, token)),
      };
    // Implementation \v - vertical whitespace
    case 'v':
      return {
        done: true,
        value: token,
        result: expressions.concat(
          factory.createSimpleNode<VerticalWhitespaceNode>(SyntaxKind.VerticalWhitespace, token),
        ),
      };
    case 'f':
      return {
        done: true,
        value: token,
        result: expressions.concat(factory.createSimpleNode<FormFeedCharNode>(SyntaxKind.FormFeedChar, token)),
      };
  }
};

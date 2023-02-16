import { waterfall } from './common/waterfall.js';
import { createHandler, createTokenizer } from './abstract/tokenizer.js';
import type {
  InferHandlerResult,
  InferTokenFromTokenizer,
  InferTokenizer,
  TokenizerStep,
  Token,
} from './abstract/tokenizer.js';

export enum TokenKind {
  SyntaxChar,
  PatternChar,
  Decimal,
  ControlEscape,
  CharClassEscape,
  CharEscape,
  DecimalEscape,
}

export const syntaxCharHandler = createHandler<
  TokenKind.SyntaxChar,
  '$' | '^' | '\\' | '.' | '*' | '+' | '?' | '(' | ')' | '[' | ']' | '{' | '}' | '|'
>(TokenKind.SyntaxChar, /[$^\\.*+?()\[\]{}|]/);
export const controlEscapeHandler = createHandler<TokenKind.ControlEscape, 'f' | 'n' | 'r' | 't' | 'v'>(
  TokenKind.ControlEscape,
  /\\(fnrtv)/,
);
export const charClassEscapeHandler = createHandler<TokenKind.CharClassEscape, 'd' | 'D' | 's' | 'S' | 'w' | 'W'>(
  TokenKind.CharClassEscape,
  /\\([dDsSwW])/,
);

export const charEscapeHandler = createHandler<TokenKind.CharEscape>(TokenKind.CharEscape, /\\(.)/);
export const patternCharHandler = createHandler<TokenKind.PatternChar>(TokenKind.PatternChar, /[^$^\\.*+?()\[\]{}|]/);
export const decimalEscapeHandler = createHandler<TokenKind.DecimalEscape, `${number}`>(
  TokenKind.DecimalEscape,
  /\\([0-9])/,
);
export const decimalHandler = createHandler<TokenKind.Decimal>(TokenKind.Decimal, /\d/);

export const regexpTokenizer = createTokenizer(
  waterfall([
    controlEscapeHandler,
    charClassEscapeHandler,
    decimalEscapeHandler,
    charEscapeHandler,
    decimalHandler,
    syntaxCharHandler,
    patternCharHandler,
  ]),
);

export type RegexpTokenizer = InferTokenizer<typeof regexpTokenizer>;
export type AnyRegexpToken = InferTokenFromTokenizer<typeof regexpTokenizer>;
export type Step = TokenizerStep<AnyRegexpToken>;

const genericChecker = <T extends AnyRegexpToken>(
  kind: AnyRegexpToken['kind'],
  token: AnyRegexpToken,
  value?: string,
): token is T => {
  return token.kind === kind && (value ? token.value === value : true);
};

export const isPatternCharToken = (
  token: AnyRegexpToken,
  value?: string,
): token is InferHandlerResult<typeof patternCharHandler> => genericChecker(TokenKind.PatternChar, token, value);

export const isDecimalToken = (
  token: AnyRegexpToken,
  value?: string,
): token is InferHandlerResult<typeof decimalHandler> => genericChecker(TokenKind.Decimal, token, value);

export const isDecimalEscapeToken = (
  token: AnyRegexpToken,
  value?: string,
): token is InferHandlerResult<typeof decimalEscapeHandler> => genericChecker(TokenKind.DecimalEscape, token, value);

export const isEscapedCharToken = (
  token: AnyRegexpToken,
  value?: string,
): token is InferHandlerResult<typeof charEscapeHandler> => genericChecker(TokenKind.CharEscape, token, value);

export const isSyntaxToken = (
  token: AnyRegexpToken,
  value?: string,
): token is InferHandlerResult<typeof syntaxCharHandler> => genericChecker(TokenKind.SyntaxChar, token, value);

export const isParenthesesOpenToken = (token: AnyRegexpToken): token is Token<TokenKind.SyntaxChar, '('> =>
  isSyntaxToken(token, '(');

export const isParenthesesCloseToken = (token: AnyRegexpToken): token is Token<TokenKind.SyntaxChar, ')'> =>
  isSyntaxToken(token, ')');

export const isBracketsOpenToken = (token: AnyRegexpToken): token is Token<TokenKind.SyntaxChar, '['> =>
  isSyntaxToken(token, '[');

export const isBracketsCloseToken = (token: AnyRegexpToken): token is Token<TokenKind.SyntaxChar, ']'> =>
  isSyntaxToken(token, ']');

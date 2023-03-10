import { waterfall } from './common/waterfall.js';
import { createHandler, createTokenizer } from './abstract/tokenizer.js';
import type { TokenizerStep, Token, Tokenizer } from './abstract/tokenizer.js';

export const enum TokenKind {
  SyntaxChar,
  PatternChar,
  Decimal,
  ControlEscape,
  CharClassEscape,
  CharEscape,
  DecimalEscape,
}

export type SyntaxCharToken = Token<
  TokenKind.SyntaxChar,
  '$' | '^' | '\\' | '.' | '*' | '+' | '?' | '(' | ')' | '[' | ']' | '{' | '}' | '|'
>;
export type CharClassEscape = Token<TokenKind.CharClassEscape, 'd' | 'D' | 's' | 'S' | 'w' | 'W'>;
export type ControlEscapeToken = Token<TokenKind.ControlEscape, 'f' | 'n' | 'r' | 't' | 'v'>;
export type CharEscapeToken = Token<TokenKind.CharEscape>;
export type PatternCharToken = Token<TokenKind.PatternChar>;
export type DecimalEscapeToken = Token<TokenKind.DecimalEscape, `${number}`>;
export type DecimalToken = Token<TokenKind.Decimal, `${number}`>;

export type AnyRegexpToken =
  | SyntaxCharToken
  | CharClassEscape
  | ControlEscapeToken
  | CharEscapeToken
  | PatternCharToken
  | DecimalEscapeToken
  | DecimalToken;
export type RegexpTokenizer = Tokenizer<AnyRegexpToken>;
export type Step = TokenizerStep<AnyRegexpToken>;

export const syntaxCharHandler = createHandler<SyntaxCharToken>(TokenKind.SyntaxChar, /([\\.*+?)(\]\[}{|$^])/);
export const controlEscapeHandler = createHandler<ControlEscapeToken>(TokenKind.ControlEscape, /\\([fnrtv])/);
export const charClassEscapeHandler = createHandler<CharClassEscape>(TokenKind.CharClassEscape, /\\([dDsSwW])/);
export const charEscapeHandler = createHandler<CharEscapeToken>(TokenKind.CharEscape, /\\(.)/);
export const decimalEscapeHandler = createHandler<DecimalEscapeToken>(TokenKind.DecimalEscape, /\\([0-9])/);
export const decimalHandler = createHandler<DecimalToken>(TokenKind.Decimal, /\d/);
export const patternCharHandler = createHandler<PatternCharToken>(TokenKind.PatternChar, /(.)/);

export const createRegexpTokenizer = (input: string): Tokenizer<AnyRegexpToken> =>
  createTokenizer(
    input,
    waterfall([
      controlEscapeHandler,
      charClassEscapeHandler,
      decimalEscapeHandler,
      decimalHandler,
      charEscapeHandler,
      syntaxCharHandler,
      patternCharHandler,
    ]),
  );

const genericChecker = <T extends AnyRegexpToken>(
  kind: AnyRegexpToken['kind'],
  token: unknown,
  value?: string,
): token is T => {
  return typeof token === 'object' && !!token && 'kind' in token
    ? token.kind === kind && (value && 'value' in token ? token.value === value : true)
    : false;
};

export const isPatternCharToken = (token: unknown, value?: string): token is PatternCharToken =>
  genericChecker(TokenKind.PatternChar, token, value);

export const isDecimalToken = (token: unknown, value?: string): token is DecimalToken =>
  genericChecker(TokenKind.Decimal, token, value);

export const isDecimalEscapeToken = (token: unknown, value?: string): token is DecimalEscapeToken =>
  genericChecker(TokenKind.DecimalEscape, token, value);

export const isEscapedCharToken = (token: unknown, value?: string): token is CharEscapeToken =>
  genericChecker(TokenKind.CharEscape, token, value);

export const isSyntaxCharToken = (token: unknown, value?: string): token is SyntaxCharToken =>
  genericChecker(TokenKind.SyntaxChar, token, value);

export const isParenthesesOpenToken = (token: unknown): token is Token<TokenKind.SyntaxChar, '('> =>
  isSyntaxCharToken(token, '(');

export const isParenthesesCloseToken = (token: unknown): token is Token<TokenKind.SyntaxChar, ')'> =>
  isSyntaxCharToken(token, ')');

export const isBracketsOpenToken = (token: unknown): token is Token<TokenKind.SyntaxChar, '['> =>
  isSyntaxCharToken(token, '[');

export const isBracketsCloseToken = (token: unknown): token is Token<TokenKind.SyntaxChar, ']'> =>
  isSyntaxCharToken(token, ']');

export const isForwardSlashToken = (token: unknown): token is Token<TokenKind.PatternChar, '/'> =>
  isPatternCharToken(token, '/');

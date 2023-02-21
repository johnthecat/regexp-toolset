export type Formatter = (x: string) => string;

const replaceClose = (string: string, close: string, replace: string, index: number): string => {
  const start = string.substring(0, index) + replace;
  const end = string.substring(index + close.length);
  const nextIndex = end.indexOf(close);
  return ~nextIndex ? start + replaceClose(end, close, replace, nextIndex) : start + end;
};

export const createFormatter =
  (open: string, close: string, replace = open): Formatter =>
  (input: string) => {
    const string = '' + input;
    const index = string.indexOf(close, open.length);
    return ~index ? open + replaceClose(string, close, replace, index) + close : open + string + close;
  };

export const create256ColorsFormatter = (background: number | null, text?: number | null): Formatter => {
  return createFormatter(
    `${background ? `\x1b[48;5;${background}m` : ''}\x1b[38;5;${text || 0}m`,
    `${background ? '\x1b[49m' : ''}\x1b[39m`,
  );
};

export const create256ColorsBgFormatter = (background: number): Formatter => create256ColorsFormatter(background);

export const create256ColorsTextFormatter = (text: number): Formatter => create256ColorsFormatter(null, text);

export const dim = createFormatter('\x1b[2m', '\x1b[22m', '\x1b[22m\x1b[2m');
export const bold = createFormatter('\x1b[1m', '\x1b[22m', '\x1b[22m\x1b[1m');
export const italic = createFormatter('\x1b[3m', '\x1b[23m');
export const underline = createFormatter('\x1b[4m', '\x1b[24m');
export const inverse = createFormatter('\x1b[7m', '\x1b[27m');
export const reset = createFormatter('\x1b[0m', '\x1b[0m');
export const resetEnd = createFormatter('', '\x1b[0m');

const ansiEscapeCode = '[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PRZcf-nqry=><]';
const zeroWidthCharacterExceptNewline =
  '\u0000-\u0008\u000B-\u0019\u001b\u009b\u00ad\u200b\u2028\u2029\ufeff\ufe00-\ufe0f';
const zeroWidthCharacter = '\n' + zeroWidthCharacterExceptNewline;
// eslint-disable-next-line no-misleading-character-class
const partitionRegexp = new RegExp(
  '((?:' + ansiEscapeCode + ')|[\t' + zeroWidthCharacter + '])?([^\t' + zeroWidthCharacter + ']*)',
  'g',
);

const printablePartitions = (str: string): [string, string][] => {
  const spans: [string, string][] = [];
  for (let m; partitionRegexp.lastIndex !== str.length && (m = partitionRegexp.exec(str)); ) {
    spans.push([m[1] || '', m[2] || '']);
  }
  partitionRegexp.lastIndex = 0;
  return spans;
};

const slicePrintable = (str: string, start: number, end?: number) => {
  let result = '';
  let cursor = 0;
  const hasEnd = typeof end === 'number';

  for (const [nonPrintable, printable] of printablePartitions(str)) {
    const text = Array.from(printable).slice(
      Math.max(0, start - cursor),
      Math.max(0, hasEnd ? end - cursor : printable.length),
    ); // Array.from solves the emoji problem as described here: http://blog.jonnew.com/posts/poo-dot-length-equals-two
    result += nonPrintable + text.join('');
    cursor += printable.length;
    if (hasEnd && cursor > end) {
      break;
    }
  }

  return result;
};

const INDENT = 1;

export const pluralCount = (i: number): string => {
  const j = i % 10;
  const k = i % 100;
  if (j === 1 && k !== 11) {
    return i.toString() + 'st';
  }
  if (j === 2 && k !== 12) {
    return i.toString() + 'nd';
  }
  if (j === 3 && k !== 13) {
    return i.toString() + 'rd';
  }
  return i.toString() + 'th';
};

export const addIndent = (string: string, level = 1, prefix: string = ''): string => {
  return string || level === 0
    ? string.replace(/^(\s*)/gm, `${prefix}$1${' '.repeat(Math.max(0, INDENT * level))}`)
    : prefix;
};

export const colorStringPart = (str: string, start: number, end: number, color: (x: string) => string) => {
  return slicePrintable(str, 0, start) + color(slicePrintable(str, start, end + 1)) + slicePrintable(str, end + 1);
};

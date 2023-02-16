export const createUnderline = (start: number, end: number): string => {
  return ' '.repeat(start) + '═'.repeat(1 + end - start);
};
export const createCodeFrame = (source: string, start: number, end: number, message: string) => {
  const commonPadding = ' ';
  const lineStart = '❱ ';

  return (
    commonPadding +
    lineStart +
    source +
    '\n' +
    commonPadding +
    commonPadding.repeat(lineStart.length) +
    createUnderline(start, end) +
    '\n' +
    commonPadding +
    message.padStart(
      commonPadding.length + Math.min(start + message.length, source.length + Math.round(message.length / 2)),
      ' ',
    )
  );
};

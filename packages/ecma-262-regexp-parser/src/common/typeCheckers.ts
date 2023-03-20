// types

export type IsVoid<T> = [T] extends [void] ? true : false;

export const isBoolean = (x: unknown): x is boolean => typeof x === 'boolean';
export const isNumber = (x: unknown): x is number => typeof x === 'number';
export const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
export const isFunction = (x: unknown): x is (...args: any[]) => any => typeof x === 'function';
export const isVoid = (x: unknown): x is void => typeof x === 'undefined';

export const nonNullable = <T>(value: T): value is Exclude<T, null | void> => {
  return value !== void 0 && value !== null;
};

// helpers

export const not = <T extends (...args: any[]) => boolean>(fn: T): ((...args: Parameters<T>) => boolean) => {
  return (...args) => !fn(...args);
};

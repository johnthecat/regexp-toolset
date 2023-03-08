export const isBoolean = (x: unknown): x is boolean => typeof x === 'boolean';

export const isNumber = (x: unknown): x is number => typeof x === 'number';

export const nonNullable = <T>(value: T): value is Exclude<T, null | void> => {
  return value !== void 0 && value !== null;
};

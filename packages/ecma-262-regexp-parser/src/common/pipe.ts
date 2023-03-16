export const pipe2 = <F1 extends (...args: any[]) => any, F2 extends (arg: ReturnType<F1>) => any>(
  f1: F1,
  f2: F2,
): ((...args: Parameters<F1>) => ReturnType<F2>) => {
  return (...args) => f2(f1(...args));
};

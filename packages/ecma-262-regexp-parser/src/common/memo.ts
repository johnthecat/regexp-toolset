export const memo = <A, R>(fn: (arg: A) => R): ((arg: A) => R) => {
  const cache = new Map<A, R>();
  return arg => {
    let record = cache.get(arg);
    if (!record) {
      record = fn(arg);
      cache.set(arg, record);
    }

    return record;
  };
};

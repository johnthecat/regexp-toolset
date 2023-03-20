export type Token<K, V extends string = string> = {
  kind: K;
  value: V;
  start: number;
  end: number;
};

export type AnyToken<K = any, V extends string = string> = Token<K, V>;

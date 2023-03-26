import type { AnyRegexpNode } from 'ecma-262-regexp-parser';

export type ExplainRenderer<T> = {
  init(rootNode: AnyRegexpNode): void;
  renderRoot(regexp: T, flags: T | null, body: T): T;
  renderRegexp(node: AnyRegexpNode): T;
  renderFlags(flags: string): T;
  renderNodeExplain(title: string, parentNode: AnyRegexpNode, node: AnyRegexpNode, children: T | T[] | null): T;
  beforeNodeExplain(parentNode: AnyRegexpNode, node: AnyRegexpNode): void;
};

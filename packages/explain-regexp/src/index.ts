import { parseRegexp, parseRegexpNode } from 'ecma-262-regexp-parser';
import { explainNode, type ExplainerContext } from './explainNode.js';
import type { ExplainRenderer } from './renderer.js';

export { createCliRenderer } from './cliRenderer/index.js';

const createExplainerContext = <T>(source: string, renderer: ExplainRenderer<T>): ExplainerContext<T> => ({
  source,
  renderer,
});

export const explainRegexp = <T>(source: string, renderer: ExplainRenderer<T>): T => {
  const ctx = createExplainerContext(source, renderer);
  const regexp = parseRegexp(source);
  renderer.init(regexp);
  const result = explainNode(regexp, regexp, ctx);
  return renderer.renderRoot(renderer.renderRegexp(regexp), renderer.renderFlags(regexp.flags), result);
};

export const explainRegexpPart = <T>(source: string, renderer: ExplainRenderer<T>): T => {
  const ctx = createExplainerContext(source, renderer);
  const regexp = parseRegexpNode(source);
  renderer.init(regexp);
  const result = explainNode(regexp, regexp, ctx);
  return renderer.renderRoot(renderer.renderRegexp(regexp), null, result);
};

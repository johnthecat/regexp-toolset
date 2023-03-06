import { describe, it, expect } from 'vitest';
import { fillExpressions } from '../regexpParseUtils.js';
import { regexpTokenizer } from '../regexpTokenizer.js';
import { createParserContext } from '../regexpParser.js';
import { errored, matched } from '../common/monads/match.js';
import { createCharNode } from '../regexpNodeFactory.js';

describe('fillExpressions', () => {
  it('should work', () => {
    const source = 'hello';
    const tokenizer = regexpTokenizer(source);
    const token = tokenizer.getFirstStep();
    if (!token) {
      throw new Error('Fail');
    }
    const result = fillExpressions(token, createParserContext(source, tokenizer), ({ token, nodes }) => {
      return matched({ nodes: nodes.concat(createCharNode(token.value, token, 'simple')), token });
    });

    expect(result.unwrap()).toMatchSnapshot();
  });

  it('should propagate error', () => {
    const source = '12';
    const tokenizer = regexpTokenizer(source);
    const token = tokenizer.getFirstStep();
    if (!token) {
      throw new Error('Fail');
    }
    const result = fillExpressions(token, createParserContext(source, tokenizer), ({ token, nodes }) => {
      if (token.value === '1') {
        return matched({ nodes: nodes.concat(createCharNode(token.value, token, 'simple')), token });
      }
      return errored(new Error('This is 2.'));
    });

    expect(result.unwrap()).toMatchSnapshot();
  });
});

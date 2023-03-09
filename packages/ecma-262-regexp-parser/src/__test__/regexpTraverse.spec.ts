import { describe, it, expect } from 'vitest';
import { parseRegexp } from '../api.js';
import { printRegexpNode } from '../regexpPrinter.js';
import { traverseRegexpNode } from '../regexpTraverse.js';
import type { AnyRegexpNode } from '../regexpNodes.js';

const collector = () => {
  const result: string[] = [''];
  return {
    push: (node: AnyRegexpNode, label?: string) => {
      result.push(
        `${label ? `[${label}]`.padEnd(8, ' ') : ''}${node.start.toString().padStart(3, ' ')}:${node.end
          .toString()
          .padEnd(3, ' ')} ${node.kind} ${printRegexpNode(node)}`,
      );
    },
    print: () => result.join('\n') + '\n',
  };
};

describe('Traverse', () => {
  it('should call simple enter visitor', () => {
    const ast = parseRegexp(/a|b/);
    const x = collector();
    traverseRegexpNode(ast, {
      Char: x.push,
    });
    expect(x.print()).toMatchInlineSnapshot(`
      "
        1:1   Char a
        3:3   Char b
      "
    `);
  });

  it('should call enter visitor in full visitor', () => {
    const ast = parseRegexp(/a|b/);
    const x = collector();
    traverseRegexpNode(ast, {
      Char: {
        enter: x.push,
      },
    });
    expect(x.print()).toMatchInlineSnapshot(`
      "
        1:1   Char a
        3:3   Char b
      "
    `);
  });

  it('should call exit visitor', () => {
    const ast = parseRegexp(/a|b/);
    const x = collector();
    traverseRegexpNode(ast, {
      Char: {
        exit: x.push,
      },
    });
    expect(x.print()).toMatchInlineSnapshot(`
      "
        1:1   Char a
        3:3   Char b
      "
    `);
  });

  it('should call exit visitor after enter visitor', () => {
    const ast = parseRegexp(/(a|[b])/);
    const x = collector();
    traverseRegexpNode(ast, {
      '*': {
        enter: node => x.push(node, 'enter'),
        exit: node => x.push(node, 'exit'),
      },
    });
    expect(x.print()).toMatchInlineSnapshot(`
      "
      [enter]   0:8   Regexp /(a|[b])/
      [enter]   1:7   Group (a|[b])
      [enter]   2:6   Disjunction a|[b]
      [enter]   2:2   Char a
      [exit]    2:2   Char a
      [enter]   4:6   CharClass [b]
      [enter]   5:5   Char b
      [exit]    5:5   Char b
      [exit]    4:6   CharClass [b]
      [exit]    2:6   Disjunction a|[b]
      [exit]    1:7   Group (a|[b])
      [exit]    0:8   Regexp /(a|[b])/
      "
    `);
  });

  it('should call generic visitor on every node', () => {
    const ast = parseRegexp(/a(\w|[d-e]*)/);
    const x = collector();
    traverseRegexpNode(ast, {
      '*': x.push,
    });

    expect(x.print()).toMatchInlineSnapshot(`
      "
        0:13  Regexp /a(\\\\w|[d-e]*)/
        1:12  Alternative a(\\\\w|[d-e]*)
        1:1   Char a
        2:12  Group (\\\\w|[d-e]*)
        3:11  Disjunction \\\\w|[d-e]*
        3:4   AnyWord \\\\w
        6:11  Repetition [d-e]*
        6:10  CharClass [d-e]
        7:9   CharRange d-e
        7:7   Char d
        9:9   Char e
       11:11  Quantifier *
      "
    `);
  });
});

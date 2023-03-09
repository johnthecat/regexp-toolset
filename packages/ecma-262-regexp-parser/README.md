# ECMA-262 regexp parser

Regexp Parser, implemented according to [EMCA-262 Specification](https://tc39.es/ecma262/#sec-patterns).
Implemented all syntax constructions from es2022.

[![npm](https://badgen.net/npm/v/ecma-262-regexp-parser?color=blue)](https://www.npmjs.com/package/ecma-262-regexp-parser)
![size](https://badgen.net/packagephobia/install/ecma-262-regexp-parser)

## Requirements

- `Typescript >= 4.9`
- `Node.js >= 16`

## Install

```shell
$ npm i ecma-262-regexp-parser --save
```

## API Reference

### `parseRegexp(source: string | RegExp): RegexpNode`

Returns AST of full regexp expression (e.g. `/Hello!/gm`).
Throws, if got any syntax error.

```typescript
import { parseRegexp } from 'ecma-262-regexp-parser';

const regexpNode = parseRegexp(/[A-z]*/gm);
```

### `parseRegexpNode(source: string): AnyRegexpNode`

Returns AST of any regexp expression (e.g. `(Hello|Hi)!`).
Throws, if got any syntax error.

```typescript
import { parseRegexpNode } from 'ecma-262-regexp-parser';

const regexpNode = parseRegexpNode('(?:Maybe)\\snot');
```

### `printRegexpNode(node: AnyRegexpNode): string`

Prints AST back to string as full representation (e.g. `'/hello/gi'`)

```typescript
import { printRegexpNode } from 'ecma-262-regexp-parser';

const regexp = parseRegexpNode(someAST);
```

### `createRegExpFromRegexpNode(node: RegexpNode): RegExp`

Generates javascript `RegExp` from `RegexpNode`.

```typescript
import { createRegExpFromRegexpNode, parseRegexp } from 'ecma-262-regexp-parser';

const regexpNode = parseRegexp(/a|b/);
const regexp = createRegExpFromRegexpNode(regexpNode);
console.log(regexp.test('a')) // <- true
```

### `traverseRegexpNode(node: RegexpNode, visitors: ...): void`

Traverses nodes, can be used to collect information about regexp.
Visitors are object, where key is node name (or `*` for calling on each node) and value is full visitor or shorthand:

```typescript
import { traverseRegexp, parseRegexp } from 'ecma-262-regexp-parser';

const regexpNode = parseRegexp(/a|b/);
traverseRegexp(regexpNode, {
  '*': (node) => console.log(node), // will log every node enter,
  Group: {
    enter(node) {}, // will be called before child nodes traversing
    exit(node) {}, // will be called after all child nodes got traversed
  },
})
```

### `factory`

Exports all node creation methods. Names are matched node names, e.g. `CharNode` -> `factory.createCharNode`.

```typescript
import { factory, CharType } from 'ecma-262-regexp-parser';

const charNode = factory.createCharNode('a', CharType.Simple, { start: 0, end: 0 });
```

### `types`

Exports node type checkers, that can be used to narrow node type.

```typescript
import { types, parseRegexpNode } from 'ecma-262-regexp-parser';

const node = parseRegexpNode('(a|b)');
if (types.isGroupNode(node)) {
  // node type is narrowed to GroupNode
}
```

### Enums

* `SyntaxKind` - describes all possible node types.
* `ControlEscapeCharType` - types of `ControlEscapeCharNode`;
* `QuantifierType` - types of `QuantifierNode`;
* `CharType` - types of `CharNode`.


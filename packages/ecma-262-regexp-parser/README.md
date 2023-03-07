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
const regexpAST = parseRegexp(/[A-z]*/gm);
```

### `parseRegexpNode(source: string): AnyRegexpNode`
Returns AST of any regexp expression (e.g. `(Hello|Hi)!`).
Throws, if got any syntax error.

```typescript
import { parseRegexpNode } from 'ecma-262-regexp-parser';
const regexpAST = parseRegexpNode('(?:Maybe)\\snot');
```

### `printRegexpNode(ast: AnyRegexpNode): string`
Prints AST back to string as full representation (e.g. `'/hello/gi'`)

```typescript
import { printRegexpNode } from 'ecma-262-regexp-parser';
const regexp = parseRegexpNode(someAST);
```

### `createRegExpFromRegexpNode(ast: RegexpNode): RegExp`
Generates javascript `RegExp` from `RegexpNode`.

```typescript
import { createRegExpFromRegexpNode, parseRegexp } from 'ecma-262-regexp-parser';
const regexpAST = parseRegexp(/a|b/);
const regexp = createRegExpFromRegexpNode(regexpAST);
console.log(regexp.test('a')) // <- true
```

### `SyntaxKind`
Enum, which describes all possible node types.


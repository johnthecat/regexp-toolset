# Ecma-262 RegExp parser

RegExp Parser, implemented according to [Specification](https://tc39.es/ecma262/#sec-patterns).

## Requirements
- `Typescript >= 4.9`

## Installation
  ```bash
  npm i ecma-262-regexp-parser --save
  ```

## Usage

```ts
import { parseRegexp } from 'ecma-262-regexp-parser';
try {
  const ast = parseRegexp('/[A-z]*/gm');
  // ... do smth
} catch (parsingError) {
  throw parsingError;
}
```

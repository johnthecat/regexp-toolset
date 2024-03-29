#!/usr/bin/env node
import { isatty } from 'node:tty';
import { readFileSync } from 'node:fs';
import { stdout, stderr } from 'node:process';
import { program } from 'commander';
import { explainRegexp, explainRegexpPart, createCliRenderer } from '../dist/index.js';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), { encoding: 'utf-8' }));
const isColorSupportedByEnv =
  'FORCE_COLOR' in process.env ||
  process.platform === 'win32' ||
  (isatty(1) && process.env.TERM !== 'dumb') ||
  'CI' in process.env;

const terminalPrefix = '\u001Bc\n';
const terminalPostfix = '\n'.repeat(2);

program
  .name('ECMA-262 RegExp explainer - shows struct, decode symbols, explains flags and relationships inside expression.')
  .description('Show detailed tree representation of regexp with comments.')
  .version(packageJson.version)
  .argument('<regexp>', 'Regexp expression, wrapped into quotes')
  .option('-d, --debug', 'Shows full error stacktrace', false)
  .option('--no-color', 'Disabled color for output', false)
  .option('--color', 'Forces color output', isColorSupportedByEnv)
  .action((regexp, { debug, color: enableColors }) => {
    try {
      stdout.write(terminalPrefix + explainRegexp(regexp, createCliRenderer(enableColors)) + terminalPostfix);
    } catch (e) {
      if (debug) {
        console.error(e);
      } else {
        stderr.write('\n' + e.toString() + '\n');
      }
      process.exitCode = 1;
    }
  });

program
  .command('part')
  .description('Explains part of regexp, e.g. "[A-z]"')
  .argument('<regexp>', 'Partial regexp expression, wrapped into quotes')
  .option('-d, --debug', 'Shows full error stacktrace', false)
  .option('--no-color', 'Disabled color for output', false)
  .option('--color', 'Forces color output', isColorSupportedByEnv)
  .action((regexp, { debug, color: enableColors }) => {
    try {
      stdout.write(terminalPrefix + explainRegexpPart(regexp, createCliRenderer(enableColors)) + terminalPostfix);
    } catch (e) {
      if (debug) {
        console.error(e);
      } else {
        stderr.write('\n' + e.toString() + '\n');
      }
      process.exitCode = 1;
    }
  });

program.parse();

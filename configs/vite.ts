import { builtinModules } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type LibraryFormats } from 'vite';
import dts from 'vite-plugin-dts';

const externals = (root: string) => {
  const packageJson = JSON.parse(readFileSync(resolve(root, './package.json'), { encoding: 'utf-8' }));

  return [
    ...builtinModules,
    ...builtinModules.map(x => `node:${x}`),
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
  ];
};

type ConfigInput = {
  root: string;
  entry: string;
  formats: LibraryFormats[];
  includeTypes: string[];
};

const defaultConfig: ConfigInput = {
  root: process.cwd(),
  entry: './src/index.ts',
  includeTypes: ['./src/**'],
  formats: ['es', 'cjs'],
};

export const createViteConfig = (input: Partial<ConfigInput> = defaultConfig) => {
  const mergedConfig = { ...defaultConfig, ...input };

  return defineConfig({
    build: {
      reportCompressedSize: true,
      lib: {
        entry: mergedConfig.entry,
        fileName: 'index',
        formats: mergedConfig.formats,
      },
      rollupOptions: {
        external: externals(mergedConfig.root),
      },
    },
    plugins: [
      dts({
        noEmitOnError: true,
        copyDtsFiles: true,
        include: mergedConfig.includeTypes,
        rollupTypes: true,
      }),
    ],
    test: {
      testTimeout: 3000,
      reporters: ['verbose'],
      coverage: {
        provider: 'c8',
        reporter: ['html'],
        reportsDirectory: './.coverage',
      },
    },
  });
};

import { defineConfig } from 'vitest/config';
import ts from 'typescript';
import { loadBackendEnvironment } from './src/common/db/database-config';

loadBackendEnvironment();

export default defineConfig({
  test: {
    include: ['test/**/*.{test,spec,e2e-spec}.ts'],
    // Legacy suites share seeded accounts; races use independent requests within a suite.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  plugins: [
    {
      name: 'nestjs-typescript-metadata',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('.ts') || id.includes('node_modules')) return;
        const output = ts.transpileModule(code, {
          fileName: id,
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            esModuleInterop: true,
            sourceMap: true,
          },
        });
        return { code: output.outputText, map: output.sourceMapText ?? null };
      },
    },
  ],
});

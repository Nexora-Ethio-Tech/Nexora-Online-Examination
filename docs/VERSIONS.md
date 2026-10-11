# Versions

Recorded by task W1-01 on 2026-10-11.

- Node: v24.14.1
- npm: 11.11.0

## Direct dependencies (output of `npm ls --depth=0`)

```
exam-frontend@0.0.0 C:\Users\kaleab\Desktop\Frontend\exam-frontend
+-- @eslint/js@9.39.5
+-- @testing-library/dom@10.4.2
+-- @testing-library/jest-dom@6.9.1
+-- @testing-library/react@16.3.3
+-- @testing-library/user-event@14.6.7
+-- @types/node@24.19.2
+-- @types/react-dom@19.3.0
+-- @types/react@19.3.0
+-- @vitejs/plugin-react@5.2.0
+-- eslint-plugin-react-hooks@5.2.0
+-- eslint@9.39.5
+-- jsdom@29.1.1
+-- prettier@3.9.10
+-- react-dom@19.3.0
+-- react@19.3.0
+-- typescript-eslint@8.71.1
+-- typescript@5.9.3
+-- vite@7.3.7
`-- vitest@4.1.11
```

## Decisions

- The create-vite template is not used. All files are written by hand.
- Vite 7, TypeScript 5.9, ESLint 9 with typescript-eslint 8, Vitest 4, Prettier 3. No oxlint, no TypeScript 6.
- Zod, React Router, TanStack Query and the other libraries listed in AGENTS.md are installed by later tasks. Their versions will be added then.

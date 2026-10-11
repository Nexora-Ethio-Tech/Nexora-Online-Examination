# AGENTS.md: exam-frontend

Frontend of a multi-tenant online examination SaaS for schools. React 19 + TypeScript + Vite. It runs against a mocked API (MSW) until the real backend is ready.

You are a coding agent. You execute one task card at a time. You do not design, you do not decide. Every decision is already made in this file, in `docs/`, or in the task card.

## 0. Authority and conflicts

Read in this order before every task:

1. The task card (its `Files allowed`, `Dependencies`, `Spec`, `Acceptance`)
2. This file
3. `docs/api-contract.md`, `docs/types.ts`, `docs/exam-engine.md`, `docs/screens/<screen>.md`, `docs/mock-seed.md`

If two of these contradict each other, or something you need is not written anywhere: **STOP and report it (section 11). Do not choose.**

## 1. Non-negotiable rules

1. Never add, remove or upgrade a dependency unless the task card lists it. Never upgrade a major version.
2. Touch only the files the task card allows. No drive-by refactors, renames, formatting changes or "improvements".
3. Never invent endpoints, request fields, response fields, enum values, error codes or routes. Use only `docs/api-contract.md` and `docs/types.ts`.
4. No `any`, no `as` casts to silence errors, no `@ts-ignore`, no `@ts-expect-error`, no `eslint-disable`, no non-null `!` assertions.
5. Server data only through TanStack Query hooks in `features/<name>/hooks.ts`. No axios or fetch calls inside components.
6. UI only from `src/components/ui` (shadcn) and `src/components/shared`. Do not hand-write buttons, inputs, dialogs, tables or selects. Do not edit files in `src/components/ui`.
7. English strings written directly in JSX. No i18n library.
8. Never put tokens, passwords or exam answers in `localStorage` or `sessionStorage`. The only exceptions: the autosave queue (IndexedDB via idb-keyval) and the dev-only key `mock_session_user_id`.
9. Every task ends with `npm run check` passing. Paste its output in your report.
10. Do not modify anything under `docs/` unless the task card says so. Docs are written by someone else.

## 2. Stack (locked)

- Node 22, npm only. Do not use pnpm or yarn. Do not create other lockfiles.
- Vite, React 19, TypeScript 5 (strict + `noUncheckedIndexedAccess`)
- Tailwind CSS v4, shadcn/ui (new-york, neutral, CSS variables), lucide-react, sonner
- React Router v7, library mode: `createBrowserRouter`; import from `react-router`, `RouterProvider` from `react-router/dom`. No framework mode. No route loaders for data.
- TanStack Query v5 (server state), Zustand v5 (auth store and exam UI flags only)
- React Hook Form v7 + Zod + `@hookform/resolvers`
- axios, date-fns, `@tanstack/react-table` v8, idb-keyval
- Tests: Vitest, jsdom, Testing Library, user-event, MSW v2, fake-indexeddb, Playwright (Chromium only)
- Exact installed versions are recorded in `docs/VERSIONS.md`. Do not change them.

Forbidden: Redux, MobX, XState, SWR, Formik, Moment, Lodash, any other UI kit, CSS-in-JS, CSS modules, Next.js, Storybook, Husky, any analytics or telemetry.

## 3. Structure and naming

```
src/
  main.tsx
  app/              router.tsx, providers.tsx, guards/RequireRole.tsx, layouts/
  features/<name>/  api.ts, hooks.ts, schemas.ts, components/, pages/
  components/ui/    shadcn only (generated, never hand-edited)
  components/shared/  DataTable, PageHeader, EmptyState, ConfirmDialog, FormField
  lib/              env.ts, api-client.ts, query-client.ts, format.ts, utils.ts
  mocks/            browser.ts, server.ts, db.ts, seed.ts, handlers/
  types/            domain.ts (copy of docs/types.ts)
tests/e2e/          Playwright specs
```

- React component files: `PascalCase.tsx`. Every other file: `kebab-case.ts`.
- Named exports only. No default exports (except where a tool's config file requires one).
- One component per file. Function components. Props typed with `type Props = {...}`. Do not use `React.FC`.
- Tests sit next to the code as `*.test.ts(x)`. E2E tests live in `tests/e2e/`.

## 4. Code conventions

- Types come from `docs/types.ts` (copied to `src/types/domain.ts`). Zod schemas live in `schemas.ts`; derive types with `z.infer`.
- `api.ts`: plain async functions, typed input and output, using the shared `apiClient`. `hooks.ts`: `useQuery` / `useMutation` wrappers. Each feature exports a query key factory, for example `questionKeys.list(params)`.
- Mutations invalidate by query key and show a sonner toast on success and on error. Error text comes from `ApiError.message`. Field errors come from `ApiError.details` and are set on the form with `setError`.
- Forms: React Hook Form + `zodResolver`. Inline field errors. Submit button disabled while pending. Use `FormField` from `components/shared`.
- Every data screen implements four states: loading (Skeleton), empty (EmptyState), error (message and a retry button), success. A screen that lacks one is not finished.
- Destructive actions go through `ConfirmDialog`.
- Dates are ISO 8601 UTC strings in data. Display with date-fns in the user's local time through helpers in `lib/format.ts`. Date and time inputs are native `datetime-local`.
- Styling: Tailwind classes only. No inline `style` except for values computed at runtime. Use the `cn` helper from `lib/utils.ts`.
- Role accent color comes from the `data-role` attribute and the `--accent` CSS variable. Do not hard-code role colors in components.
- No `console.log` in committed code. No commented-out code. Comments only explain why, never what.
- No data fetching or derived state inside `useEffect`. Every listener, interval and timeout you create is cleaned up.
- Accessibility: every input has a label, buttons are real `<button>` elements, dialogs come from shadcn.

## 5. Auth and tenancy

- The access token lives only in memory (the Zustand auth store). It is never persisted.
- The refresh token is an httpOnly cookie managed by the server. The client calls `POST /auth/refresh` with `withCredentials: true` on app start to restore the session.
- On any 401: do a single-flight refresh (all concurrent requests wait for one refresh call), retry the original request once. If refresh fails, clear the store and go to `/login`.
- The server derives the school from the token. The frontend never sends `schoolId` to scope data and never relies on a URL id for access.
- Role guards in the frontend are for user experience only, not security.
- Mock mode only (`VITE_USE_MOCKS=true`): the mock refresh handler reads the dev-only key `mock_session_user_id`.

## 6. Exam session rules (details in `docs/exam-engine.md`)

- One route, `/exam/:token`, driven by a pure reducer: `resolving`, `holding`, `starting`, `active`, `submitting`, `submitted`, `invalid`, `error`. Illegal events are ignored, never thrown.
- The client never shuffles questions or options. The server decides the order.
- The client never receives correct answers. Use `StudentQuestion` and `AnswerValue` only.
- Time comes from `server-clock.ts`. Never count down by decrementing a number. Never use the raw client clock for deadlines.
- All answer changes go through `autosave-queue.ts`. Components never call the answers endpoint directly.
- The exam guard only blocks and logs. It never penalizes a student automatically. No UI text may claim the exam is "secure" or "cheat-proof".

## 7. Mocks

- MSW handlers must match `docs/api-contract.md` exactly: same paths, methods, status codes, field names and error codes.
- All seed data lives in `mocks/seed.ts` and follows `docs/mock-seed.md`. Do not scatter test data in components or handlers.
- Components must not know whether the API is real or mocked. Never import from `mocks/` outside `main.tsx` and test setup.
- Contract changes happen in `docs/api-contract.md` first, never in code first. If you need a change, STOP (section 11).

## 8. Testing

- Required unit tests: exam session reducer, server clock, autosave queue, api-client refresh logic, `RequireRole`.
- Playwright flows: (1) student takes an exam with an offline interruption and a refresh-resume, (2) login per role lands on the right home, (3) full loop teacher, student, grading, release, student sees result.
- Test behavior, not implementation. No snapshot tests. Do not weaken or delete an existing test to make a task pass.
- A task that adds logic without the tests its card requires is not finished.

## 9. Commands

```
npm run dev        # Vite dev server
npm run build      # production build
npm run typecheck  # tsc -b
npm run lint       # eslint .
npm run format     # prettier --write .
npm run test       # vitest run
npm run e2e        # playwright test
npm run check      # typecheck + lint + prettier --check + test (must pass before you finish)
```

## 10. Git

- One task per branch: `feat/<task-id>` (example: `feat/W3-02`). Never work on `main` directly.
- One commit per task: `<task-id>: <task title>`. No force pushes. No history rewriting.
- Never commit `.env` files, secrets or `node_modules`.

## 11. When to stop

Stop immediately, change nothing further, and report, if:

- the task card, this file and `docs/` contradict each other
- you need an endpoint, field, type, route, error code or dependency that is not specified
- a required acceptance check cannot pass without breaking another rule in this file
- `npm run check` fails and your second fix attempt also fails
- you are about to touch a file the card does not allow

Report format:

```
BLOCKED: <task-id>
What I was doing:
What is missing or contradictory (quote the documents):
Options I see (do not pick one):
What I need to continue:
```

## 12. End-of-task report

When finished, report exactly this:

```
DONE: <task-id>
Files created:
Files modified:
Dependencies installed (must match the card):
npm run check output (paste):
Acceptance checks (one line each, pass or fail):
Anything skipped or uncertain:
Deviations from the card (must be: none):
```

Do not add a summary of the code. Do not suggest next steps. Do not start the next task.

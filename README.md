# exam-frontend

Frontend of a multi-tenant online examination platform for schools. React 19, TypeScript, Vite.

## Requirements

- Node 24 (LTS), npm

## Scripts

| Command             | What it does                                                            |
| :------------------ | :---------------------------------------------------------------------- |
| `npm run dev`       | Start the dev server                                                    |
| `npm run build`     | Type-check and build for production                                     |
| `npm run typecheck` | TypeScript check only                                                   |
| `npm run lint`      | ESLint                                                                  |
| `npm run format`    | Format all files with Prettier                                          |
| `npm run test`      | Run unit tests once                                                     |
| `npm run check`     | typecheck + lint + format check + tests (must pass before every commit) |

Rules for contributors and coding agents are in `AGENTS.md`.

## Current completion status

Scheduling now displays current EAT with field-specific errors and a stale-clock refresh. Offline attempt reloads show recovery guidance, with same-student return after sign-in. Follow [the scheduling/reload testing guide](docs/scheduling-reload-testing.md) and send its companion backend verification note for real integration checks.

Student exams now have collapsible question navigation and explicit preparation steps. See [the testing guide](docs/student-navigation-progress.md). No backend contract changes are required for this increment.

See the [master-plan audit](docs/master-plan-audit.md) for requirement evidence, confirmed gaps and ordered remaining tasks. The main frontend workflows exist, but frontend completion and real-backend release acceptance are not established. The `e2e` script is still a placeholder.

## School setup and accounts

Administrators now have **Live exams** with paginated sitting rosters, whole-roster counts, last contact/save times, audited device replacement and recovery links. Students can **Register replacement browser** for school approval. Follow [the monitoring testing guide](docs/live-exam-monitoring.md), including the **Load synthetic monitoring example** rehearsal. Send `../handoffs/Nexora_Backend_BE09_v0.10.zip` to the backend developer and require implementation/reporting from `docs/backend-monitor-task.md`. BE-09 requires a generation precondition on transfer; the original deadline and only server-confirmed answers carry forward. Real backend/device acceptance remains outstanding.

Administrators now have **School setup** with classes, subjects, teacher accounts/assignments, student CSV validation/import, one-time credentials, account edits, password reset and activity history. Follow [the guide](docs/school-setup.md). Send `../handoffs/Nexora_Backend_BE08_v0.9.zip` to the backend developer and require implementation/reporting from `docs/backend-school-task.md` under API contract v0.9.

The local directory demo supports generated logins and teacher ownership in the same tab. New students have no exam fixtures; full roster delivery requires the backend. Import into a new class to preserve the original Samira-only exam demonstration. Reload clears demo directory data. Never use actual student data in this simulation.

## Authentication foundation

Administrators now have **Practice release**, and students have **Practice** with first-answer feedback, approved explanations, repeated attempts and a separate best completed score. Official results remain unchanged. Follow `docs/student-practice.md` for the complete demo; send `docs/backend-practice-task.md` with contract v0.8 and the executable practice DTOs/calls to the backend developer. Release requires all related sittings to close and official results to be approved and released. Real backend acceptance remains outstanding.

Administrator **Recovery review** now supports late-upload evidence comparison and audited accept/reject decisions. In npm run dev:demo, use **Load synthetic recovery example** for a quick test. See `docs/recovery-review.md`; send `docs/backend-recovery-task.md` under contract v0.7 to the backend developer. Accepted recovery produces a candidate result revision that still needs publication approval. Backend/database acceptance remains outstanding.

Official results is now available in every role's navigation. Administrators approve publication after submission windows close; students see only released own marks/ranks; teachers see assigned reports. Staff have charts, CSV exports and a print/PDF view. Follow `docs/official-results.md` for the complete demo and send `docs/backend-results-task.md` with the current API contract to the backend developer. Practice has separate release controls under BE-07. Real backend integration remains unverified.

The application has login, administrator MFA verification, session restoration, role guards and logout. Students have assigned exams, schedules, encrypted preparation, timed unlock, questions, durable answers and final submission/receipt handling. Teachers have draft creation, template upload, import progress, question/AI review and submission for approval. Administrators can review, return, approve and schedule papers, including safe schedule changes before preparation. See `docs/api-contract.md` v0.5, `docs/student-runner.md`, `docs/teacher-workspace.md` and `docs/admin-approval-scheduling.md` for behavior and remaining real-backend acceptance.

### Local demo

For a complete 20-question mathematics rehearsal, use the [upload file](public/templates/nexora-math-20-demo.xlsx) unchanged and follow the [answer key and testing guide](docs/math-20-demo-guide.md). The guide covers 40 total marks, a deliberate 75% result, topic charts, publication, CSV/print reports and separate practice scores. The same file is downloadable from the teacher's Import tab.

Run `npm ci`, then `npm run dev:demo`. Open Vite's printed local URL.

| Role         | User ID      | Password    | MFA    |
| ------------ | ------------ | ----------- | ------ |
| Student      | DEMO-STUDENT | NexoraDemo! | None   |
| Teacher      | DEMO-TEACHER | NexoraDemo! | None   |
| School admin | DEMO-ADMIN   | NexoraDemo! | 123456 |

These are public synthetic demo values, never production credentials. The visible demo banner identifies mocked behavior. The in-memory transport resets on reload; it does not create cookies or prove real session restoration. Integration tests simulate an existing session separately. Production builds reject demo mode or VITE_USE_MOCKS=true and exclude the demo module.

Sign in as DEMO-STUDENT, open Mathematics, and click Download encrypted paper. Mathematics starts 30 seconds after the simulator starts and lasts two minutes; preparation still spans ten minutes. Keep the tab open for automatic navigation and authorized unlock at common start. English is already open for immediate testing. Answer questions, then Review and submit / Confirm submission, or let time expire. Refresh schedule now confirms its last check. See `docs/student-runner.md` and `docs/backend-runner-integration.md`.

Sign in as DEMO-TEACHER, choose New exam, save its details, then download and upload an unchanged Word/Excel example. Review both questions, add a resolution note for the second question's flag, save each review and submit for approval. The demo recognizes only these example files and simulates AI; arbitrary edited templates require BE-03 backend integration. See `docs/teacher-workspace.md` and send `docs/backend-teacher-exam-task.md` to the backend developer with the updated contract and example files.

After the teacher submits, sign out within the same tab and sign in as DEMO-ADMIN (MFA 123456). Open the paper, review all private content, enter a comment and approve. Schedule a future preparation time in EAT; common start is exactly ten minutes later. Sign out and sign in as DEMO-STUDENT to see that exact scheduled paper. Download during preparation and keep the tab connected for unlock at common start. Do not reload or open another tab between roles: this development simulator retains the shared paper only in memory. Scheduling does not automatically publish results or enable practice. Send `docs/backend-admin-exam-task.md` and the v0.5 contract to the backend developer.

Development mode does not provide a versioned offline app shell. Production builds include a verified offline asset cache; API responses and decryption keys are never cached there. IndexedDB retains local answers/final requests across logout/reload. The in-memory demo backend resets on a full reload, so real reload/session-recovery acceptance requires the actual backend. HTTPS and a browser with Web Locks are required for production exam editing.

### Connect the backend

Copy `.env.example` to an untracked `.env.local`. Set `VITE_API_BASE_URL` to the complete API prefix (for example `http://localhost:3000/api/v1` in local development), set `VITE_USE_MOCKS=false`, and run `npm run dev`. No proxy is assumed. Backend must allow the exact Vite origin with credentialed CORS. Production uses HTTPS and preferably a same-origin `/api/v1` route. Hosting must serve index.html for frontend route refreshes while routing API requests to the API.

Authentication requires GET /auth/me, GET /auth/csrf, POST /auth/login, POST /auth/mfa/verify and POST /auth/logout. CSRF bootstrap protects login; successful login/MFA fetches /auth/me for identity and a rotated token. Failed mutations are not automatically replayed. Logout failure stays visible; 401 expires the UI session without any blanket browser-storage clearing.

Real HttpOnly/Secure cookies, server-side roles, CSRF enforcement, MFA enrollment and real-device checks still require backend integration. Do not use mock test results as security or release acceptance.

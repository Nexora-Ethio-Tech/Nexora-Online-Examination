# Verified development versions

26 October 2026, `corrections`/`main` merge verification: Node **24.18.0**, npm **11.16.0**. A reproducible backend `npm ci` installed the incoming lockfile: Zod **4.6.7**, Vitest **4.1.12**, multer **2.5.0**, body-parser **2.4.0**; npm reported **0 vulnerabilities**. This records the local verification runtime; earlier runtime entries remain historical.

26 October 2026: backend Zod **4.6.7**, Vitest **4.1.12**, with explicit transitive overrides for multer **2.5.0** and body-parser **2.4.0**. Nest remains **11.2.7**. The shared parser helper now uses the Zod 4 generic signature; record schemas specify key and value schemas. Backend npm audit reports **0 vulnerabilities**. Node remains **24.14.1**. These changes address the CI audit failures; no audit checks or validation limits were disabled. See [release validation](combined-deployment-architecture-and-testing.md).

23 October 2026: pinned `qrcode` **1.5.4** and `@types/qrcode` **1.5.6** for local authenticator QR rendering. Node **24.14.1**. Installation reported three moderate advisories in existing Vitest/mocker/ip-address dependencies; no forced upgrades were applied.

21 October 2026: added pinned `kenat` **4.0.0**, the calendar engine used by Kewti. It adds one package with no runtime dependencies. Node remains **24.14.1**. Installation reports the same seven high-severity advisory entries previously documented in the frontend dependency tree; no force upgrades were applied. Kewti's dropdown guidance was reviewed at source commit `8bedfc0f6ece86cb9a70324337318a7fb2e2cb40` and adapted locally. A verified reverse-conversion guard handles the discovered century-boundary drift; see `kewti-calendar-architecture-and-testing.md`.

20 October 2026: added pinned `@fontsource/noto-sans-ethiopic` **5.3.0** for bundled regular/bold Ethiopic fonts. Node **24.14.1** is the verification runtime. Existing dependencies were not force-upgraded; frontend installation still reports seven high-severity advisory entries in the pre-existing dependency tree.

17 October 2026, backend integration work:

| Component       | Version |
| --------------- | ------- |
| Node.js         | 24.14.1 |
| npm             | 11.11.0 |
| yauzl           | 3.4.0   |
| fast-xml-parser | 5.11.2  |
| @types/yauzl    | 3.4.0   |

The importer uses lazy ZIP entry reads with bounded expanded size and validated XML. Dependencies are locked in `nexora-backend/package-lock.json`.

Security remediation during the integration work upgraded all Nest packages together to **11.2.7**, including testing and platform-express, and backend Vitest to **4.1.11** (matching the frontend). The installed multipart parser is **multer 2.4.0**. This was required by dependency advisories; it was not a feature-driven upgrade. `npm audit` subsequently reported **0 vulnerabilities**, and backend compilation plus 74 unit tests passed. The combined database/browser regression is recorded separately in the testing guide.

Nest 11 uses Express 5; the application uses explicit named routes rather than legacy wildcard patterns. Reference: [Nest Express 5 changes](https://nestjs.io/tutorials/what-s-new-in-express-5-eeb51579), [Vitest migration guidance](https://vitest.dev/guide/migration/).

# Verified development versions

17 October 2026, backend integration work:

| Component | Version |
| --- | --- |
| Node.js | 24.14.1 |
| npm | 11.11.0 |
| yauzl | 3.4.0 |
| fast-xml-parser | 5.11.2 |
| @types/yauzl | 3.4.0 |

The importer uses lazy ZIP entry reads with bounded expanded size and validated XML. Dependencies are locked in `nexora-backend/package-lock.json`.

Security remediation during the integration work upgraded all Nest packages together to **11.2.7**, including testing and platform-express, and backend Vitest to **4.1.11** (matching the frontend). The installed multipart parser is **multer 2.4.0**. This was required by dependency advisories; it was not a feature-driven upgrade. `npm audit` subsequently reported **0 vulnerabilities**, and backend compilation plus 74 unit tests passed. The combined database/browser regression is recorded separately in the testing guide.

Nest 11 uses Express 5; the application uses explicit named routes rather than legacy wildcard patterns. Reference: [Nest Express 5 changes](https://nestjs.io/tutorials/what-s-new-in-express-5-eeb51579), [Vitest migration guidance](https://vitest.dev/guide/migration/).

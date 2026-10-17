# Verified development versions

17 October 2026, backend integration work:

| Component | Version |
| --- | --- |
| Node.js | 24.14.1 |
| npm | 11.11.0 |
| yauzl | 3.4.0 |
| fast-xml-parser | 5.11.2 |
| @types/yauzl | 3.4.0 |

The importer uses lazy ZIP entry reads with bounded expanded size and validated XML. Dependency versions are locked in `nexora-backend/package-lock.json`. These additions did not upgrade the existing NestJS major version.

The backend dependency audit currently reports 11 findings: one low, six moderate, two high and two critical. The reported packages are the existing NestJS/Express multipart dependency chain and Vitest tooling, not the added ZIP/XML parsers. Runtime multipart vulnerabilities and the remaining audit findings require remediation and regression checks before deployment. No automatic force-upgrade has been applied.

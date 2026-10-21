# Amharic review output and bundled Ethiopic fonts

Verified change history through `ed01fe2`, 21 October 2026. Commit(s): 601e166.

## Precisely what changed

- Normalized generated AI review topics, explanations and review flags to Unicode NFC.
- Preserved teacher question text, option IDs and supplied answer keys in the staff-side review input. Student identities and answer histories do not belong in this payload.
- Bundled Noto Sans Ethiopic regular/bold fonts locally and added CSS font fallback/imports; recorded dependency versions and lockfile changes.
- This is not a full Amharic UI translation or an Ethiopian-calendar implementation.

## How to test

Read [setup and common checks](README.md) first. Backend commands run inside `nexora-backend`; browser/k6 and Git commands run from the repository root.

```powershell
npm run test:unit -- test/unit/ai-provider-amharic.spec.ts
```

1. Run the targeted provider test. Its decomposed accent alongside Ethiopic text tests normalization; Ethiopic characters alone would not prove it.
2. Open a synthetic exam containing Amharic text. Verify letters, wrapping and bold text at desktop and 360px width.
3. With the production shell prepared, disconnect and verify the locally bundled font remains available; inspect network errors for unexpected external font requests.
4. Using an explicitly configured staging AI provider, review a synthetic Amharic paper. A subject reviewer must check topic, explanation and flags against the supplied answer key.
5. Exercise provider timeout, refusal and truncated output: no fabricated success and no overwrite of teacher-approved content.

## Evidence and remaining limits

Synthetic provider tests passed. Live Amharic quality and physical-phone/offline font acceptance remain unverified.

See the [detailed implementation guide](../operations-development.md) and [exact commit/file inventory](COMMIT-FILE-INVENTORY.md). Record actual results using the [test report template](TEST-REPORT-TEMPLATE.md); do not mark unperformed checks as passed.

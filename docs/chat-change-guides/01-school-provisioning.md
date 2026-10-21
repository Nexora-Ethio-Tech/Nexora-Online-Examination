# School provisioning command

Verified change history through `ed01fe2`, 21 October 2026. Commit(s): 601e166.

## Precisely what changed

- Added `school:provision` as an alias for the existing protected MFA bootstrap operator; this is not a new public registration API.
- Creates a school and an administrator with a generated password and Argon2id storage. Records operator identity and reason. The administrator remains inactive until authenticator enrollment is confirmed.
- Interrupted enrollment should be recovered using the created IDs, not by creating a duplicate school.

## How to test

Read [setup and common checks](README.md) first. Backend commands run inside `nexora-backend`; browser/k6 and Git commands run from the repository root.

```powershell
npm run school:provision -- --school-name "Test School" --school-slug test-school --login-id TEST-ADMIN --display-name "Test Administrator" --operator "Test operator" --reason "Isolated staging acceptance"
```

1. On isolated staging, run the command below in a private interactive terminal. Use a new synthetic school slug.
2. Confirm the school and administrator exist once, and the account cannot log in before enrollment confirmation.
3. Complete confirmation with the authenticator. Confirm administrator login succeeds and only the new school's data is accessible.
4. Repeat with invalid slug and duplicate identifiers: expect validation/conflict without silently replacing an account.
5. Interrupt a second enrollment and recover it through the existing MFA enrollment flow; verify no duplicate school.

## Evidence and remaining limits

Requires isolated database, protected operator credentials and a private terminal. Do not paste generated passwords or enrollment secrets into test reports.

See the [detailed implementation guide](../operations-development.md) and [exact commit/file inventory](COMMIT-FILE-INVENTORY.md). Record actual results using the [test report template](TEST-REPORT-TEMPLATE.md); do not mark unperformed checks as passed.

# Owner school and administrator contact form

## Architecture
School short name is the existing unique slug, not a physical address or generated numeric school code. Uppercase letters and spaces are accepted and normalized (Eagle School becomes eagle-school). The form gives an example and explanation; its API field remains slug.
Phone and recovery email are optional for school provisioning, administrator creation and profile editing. A fixed +251 prefix sits outside the editable phone input. When supplied, the phone must contain nine national digits; the API validates +251 followed by nine digits. Email format is checked in the browser and backend. Blank or omitted contacts are stored as NULL. Existing nullable columns support this without migration.
These are format checks, not proof of contact ownership. Email/SMS verification is deferred at the user's request. No verified status is granted and MFA requirements are unchanged. Existing non-Ethiopian phone values must be corrected or cleared before saving an edited profile.
The owner action label is Authentication code. Owner guidance describes optional contact fields.

## Testing guide
1. Open Add school. Confirm School short name shows Eagle School and explains that it differs from the numeric school code.
2. Fill school, administrator names/ID, reason and a fresh authentication code. Leave phone and email empty. School creation should succeed with the existing enrollment flow.
3. Add or edit an administrator. Confirm both contacts remain optional.
4. Enter 911123456: the country prefix stays +251. Try incomplete digits or letters; saving must be rejected. A valid supplied email is required; malformed email must be rejected.
5. Save contacts, reopen the administrator and confirm values persist. Clear both and save; confirm both are empty on reopening.
6. Confirm no verification code is sent or verified badge shown. Authenticator enrollment and owner MFA continue as before.

## Deployment
Deploy frontend and owner backend together for optional contacts to work. No production data was changed by this task. Real production creation, persistence and phone-screen checks remain manual acceptance steps.

## Verification performed
Frontend check (typecheck, lint, formatting, 288 tests and 17 script tests) and production build passed. Backend build and 26 platform/contact tests passed. The existing QR helper's non-null assertion was replaced with a safe fallback to unblock lint; its test passed. Real database and browser acceptance steps above were not run.


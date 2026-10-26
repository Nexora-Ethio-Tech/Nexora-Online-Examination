# Owner enrollment: automatic private QR page

The protected create/recover operator can now generate a unique local HTML QR page from the exact secret created by that invocation. Set OWNER_ENROLLMENT_DIRECTORY to an absolute private directory outside Git. The local production enrollment wrapper already sets it to its protected folder.

On Windows the page opens automatically. It has no remote resources, escapes account labels, and includes the matching manual key. The password remains in the private terminal. The five-minute confirmation window starts after page preparation. The account still requires a phone-generated confirmation code, and recovery still replaces the password/secret and revokes sessions. No MFA checks or attempt limits are bypassed.

The generated file is removed when the operator exits normally or fails through its finally block. A forced termination can leave the private file behind; close the tab and remove obsolete setup files after enrollment. Loaded browser pages may remain visible after file deletion. Do not share or screenshot them.

## User steps

Run the existing private enroll-owner.ps1 with -Action recover, supply your own owner login ID, and save the new password. Scan the newly opened page or use its manual key. Enter a fresh code from that new entry into the same terminal. Only the message Owner active confirms activation. Wait for another code before login. Do not use a page or authenticator entry from an earlier recovery.

## Verification

Backend build passed. Eleven targeted tests passed covering MFA cryptography and page rendering/escaping. A real phone scan and activation remain user acceptance steps; no production account was changed by implementing this helper.

# Create a school and help its administrator sign in

## Who uses which account?
You and Yonas use platform-owner accounts. A school administrator uses a separate school account. An owner password and authenticator are not the school's administrator password and authenticator.
Each staff account normally has one authenticator entry that works across all its assigned exams. Choosing an exam does not create another authenticator.

## 1. Open the owner portal
After combined hosting is deployed, use https://nexora-online-examination.vercel.app/login for both owners and school users. Enter your own ID and password, then your authenticator code when asked. The verified account determines the workspace. Until that rollout is verified, the existing owner website remains available.
After the combined deployment is activated, use https://nexora-online-examination.vercel.app/platform instead. Until that change is deployed, continue using the current address.
Sign in with your owner ID, password and the current six-digit code from your authenticator. Wait for a fresh code before performing another protected action.

## 2. Create the school
Choose Add school. Enter its full school name and a unique short name. The updated form accepts Eagle School and stores its short name as eagle-school. That is not a street address. Nexora automatically allocates the permanent numeric school code; you do not choose or reuse it.
Enter the first administrator's login ID and their first, father's and grandfather's names. Phone and recovery email are optional. Phone has a fixed +251 prefix: enter nine digits without a leading zero. Contact verification is not implemented; these are contact details only.
Enter a reason and your fresh owner authentication code, then confirm. The school begins its trial and the administrator must complete authenticator enrollment before sign-in.

## 3. Save and privately deliver the administrator's access details
The result shows the administrator login ID, a generated password and a private setup link. Save the password immediately; it cannot be looked up again and disappears from the page. Share these details privately with the intended administrator, never in the developer group.
The setup link expires in 30 minutes. Do not send an owner encryption key, owner authenticator secret or database credential. None is needed by the school administrator.

## 4. Administrator completes setup in the browser
Open the private setup link. Enter the administrator login ID and generated password when asked. Start authenticator setup. Scan the QR using an authenticator app on the administrator's phone, or use the manual setup key shown on the page.
Enter the current six-digit code into the setup page and confirm. Finish while the setup page is valid. Wait for the next fresh code before signing in. No terminal commands are needed for school administrator enrollment.
Keep the setup key private: it can duplicate the authenticator on another device. Separate people should normally have separate administrator accounts so activity identifies the person.

## 5. Sign in and test the school
Open https://nexora-online-examination.vercel.app/login. Use the administrator login ID and password, then their authenticator code when prompted.
Create grades/classes, subjects and staff. Import a small student roster. Test assignment, exam import/review, approval/scheduling, student download, staff assistance and results using this test school. These tests save real data if the portal is connected to production.

## 6. If the password or setup link is lost
Owner: select the school and choose Recover school administrator. Enter a reason, load administrators, choose the correct login ID and confirm the identity check. Leave MFA reset unchecked when the administrator still has a working authenticator. Confirm with a fresh owner code and save the replacement password.
If authenticator enrollment must be replaced, check the MFA-reset option. This invalidates the old authenticator and deactivates the administrator until the new private setup link is completed. Deliver the newly generated password and link privately.
Edit administrator information changes profile details; it does not display existing passwords.

## 7. Add another administrator
Open the school and choose Add school administrator. Give that person a distinct login ID. Complete their names, optional contacts, reason and your fresh code. Deliver their own generated password and setup link. Their authenticator is independent of yours.

## Common checks
- Invalid credentials: use the login ID, not a person's name, internal UUID or school code. Use the newest password after a reset.
- MFA not accepted: select the correct account entry and use a fresh code from the latest completed setup. An expired setup link needs a new recovery invitation.
- Inactive account: complete enrollment; merely adding a key to the phone does not activate the portal account.
- School unavailable: check school access status and the selected deployment before resetting credentials.

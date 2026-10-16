# Official results frontend

Implemented increment: role-specific Official results navigation, staff sitting reports, administrator publication approval, student released marks/percentage/competition rank, primary-topic and distribution bars, whole-sitting CSV, all-authorized-sittings CSV and print/save-as-PDF styling. API v0.6 is issued by docs/backend-results-task.md. No backend implementation is claimed.

## Try the complete demo

1. Keep one demo tab open. Use the teacher-created, administrator-approved and scheduled paper from the previous increment. The six older synthetic runner examples are not linked to this results workspace.
2. As the student, prepare that paper, wait for its actual common start, answer and confirm final submission. A receipt is required for an official score. Do not refresh the whole page or open a different tab: demo server state is in memory.
3. Sign out, sign in as administrator, open **Official results**, then **View results** for that paper. You can inspect the marks and charts before student release. Wait until the exam ends plus its five-second final acceptance allowance before approving publication.
4. Set **Results release date and time (EAT)**, enter a publication reason and check the review confirmation. Any unresolved attempt requires an explicit exclusion reason; exclusion preserves its retained work and yields no score/rank. Click **Approve publication**. A past release time after the acceptance boundary means immediate release on approval; a future time remains gated.
5. Sign out and sign in as the student. Official results shows a waiting status before release, then the official mark/percentage/rank after release (polls every 15 seconds, or click Refresh results). Best practice remains separate and empty until that later increment.
6. As teacher, open Official results to view assigned reports/charts and export. Teachers have no publication controls. Staff can download sitting CSV, all scoped CSV and print a report/save as PDF.

EAT is UTC+3, independent of your computer's timezone. datetime-local fields use 24-hour time. Preparation still lasts the full ten minutes; no demo shortcut was added.

## Architecture and limits

Schemas/api.ts in src/features/results define the typed client. All reads use school/user-partitioned TanStack Query keys; server authorization remains mandatory. ApiClient supports text responses for CSV while retaining the existing cookie, error, timeout and 401 handling. Reports are a full explicitly requested revision from the export endpoint, so charts and downloads do not aggregate only one roster page. React renders escaped text; no raw HTML report execution.

The development simulator grades committed answers from the frozen approved version and retains publication snapshots. It has one linked student/class/subject; assigned-scope denial and tie ranking are exercised in synthetic tests. It does not prove real multi-school security or database durability. Late recovery acceptance/regrading tests change simulator state directly: there is no new recovery decision UI in this increment. Practice, directory setup and live monitoring remain separate work.

Verification covers deterministic ranking/denominators, raw student privacy, release boundaries, accommodation window gating, exclusion/revision preservation, scoped exports, CSV injection escaping, UI confirmation and teacher/student restrictions. The existing teacher → admin → student submission test now also checks the resulting staff score and unreleased student result. Run npm run check and npm run build; actual results are recorded in the delivery response.

Live browser automation remains unavailable in this environment (computer-use initialization fails with missing kernel-assets path). Screen/phone layout and physical print/PDF output still require a manual browser check. This is distinct from automated React and API-simulator tests. Real backend/database, restart/race, offline/phone and capacity acceptance remain mandatory.

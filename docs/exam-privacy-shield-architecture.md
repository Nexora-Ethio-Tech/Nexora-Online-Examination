# Exam Privacy Shield architecture

Implemented locally on 21 October 2026. This is display privacy and a sharing deterrent, not screenshot detection or guaranteed capture prevention.

## Display boundary

`ExamPrivacyShield` wraps the active runner's instructions, question navigator, question, answers and submission controls. Blur, hidden visibility, pagehide and beforeprint hide this content synchronously, then render a black return screen. The subtree stays mounted; its DOM is hidden from ordinary interaction and accessibility navigation. A focused, visible page and an explicit Resume action are required to reveal it. Returning focus alone is insufficient. Handlers are removed on unmount.

The engine remains mounted outside this boundary. Its deadline, persistence queue, answer uploads, submission and supervision checks continue. This display control cannot grant authorization: staff suspension and assistance pauses remove active content through the existing engine workflow. Resume never calls a staff approval API. No new automatic staff-unlock policy is introduced.

## Privacy and supervision

The watermark tiles across the question area and includes a readable label with an attempt reference and a device timestamp displayed in Ethiopian calendar and standard AM/PM EAT, without names or login IDs. The timestamp is a deterrent label, not trusted server evidence. A determined user can alter client rendering; no overlay is an authorization boundary.

The existing bounded durable interruption queue gains `focus_lost`. Backend validation accepts it alongside hidden, returned, pagehide and fullscreen_exit. Existing tenant, owner, device-generation, replay and count checks remain. There is no screenshot event and no automatic penalty. Observed timestamps remain client claims. No migration is required because events are stored as JSON payloads.

Deploy the backend accepting `focus_lost` before the frontend sends it. Older clients with strict event schemas must be updated before schools use the new event. Failed telemetry must never erase answer evidence.

## Printing and limitations

Print CSS is scoped by the mounted exam shield and hides the application root, replacing it with a notice. Authorized result printing on other routes is unchanged. Beforeprint also conceals content after the dialog closes until Resume. There is no clipboard modification, F12 blocking or shortcut interception.

Operating-system capture can precede event delivery or painting, or occur without blur. Screen recording and external cameras remain possible. Native kiosk/capture exclusion is future work and is not implemented by this feature.

See [testing and acceptance](exam-privacy-shield-testing.md).

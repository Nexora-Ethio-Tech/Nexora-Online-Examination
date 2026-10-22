# Resumable guides and owner portal

## Architecture

`GuidedTour` saves only guide revision, tip index, paused and completed flags in browser preferences. School guides are scoped by school, user and role. Open this area navigates without completing or dismissing the tip. Close guide pauses it; Portal guide resumes the same tip. Finish guide records completion, and reopening a completed guide restarts it. Changed manifest content offers updated guidance again. Blocked browser storage does not block the portal.

The current navigation target is outlined and the tip is placed beside it where space permits, clamped to the viewport. On narrow layouts with hidden navigation, the page heading provides the fallback anchor. Pointer hover is not required: controls support keyboard and touch. The guide remains absent from the active student exam runner.

Owner guide explains schools, school creation, access recovery, processing and activity. The owner portal uses clearer headings and explanations while preserving its separate authentication, fresh authenticator checks and audit requirements. School cards remain paginated; selecting a card opens its management actions. No cross-school privilege bypass was introduced.

## Testing

1. Sign in as administrator, teacher and student separately. Open Portal guide, advance, then Open this area. The correct page must open and the same tip remain available.
2. Close guide, browse another page and reopen Portal guide. It must resume. Reload and repeat. Finish the guide; it should stay closed on return until manually reopened or its content changes.
3. On a narrow viewport, ensure the tip fits, scrolls if needed and does not prevent closing or navigating. Use Tab/Enter as well as touch. Start a student exam and verify no tour covers the runner.
4. Sign in as platform owner and open Owner guide. Follow school cards, Add school, Processing status and Owner activity. Use only the local test school; suspension and recovery change access.
5. Verify that owner actions still require a reason, confirmation where applicable and authenticator code. One-time passwords must remain outside browser storage and query caches.

Guide unit tests cover progress persistence and unavailable storage. Owner tests cover its independent login and safe credential retry behavior. Visual positioning and real-phone usability require browser/device checks.

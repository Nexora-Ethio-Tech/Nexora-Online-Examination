# Retention decision: cleanup disabled

On 15 October 2026 the user explicitly selected **Keep cleanup disabled for now**. No automatic deletion, expiry timer, cleanup button or service-worker cache pruning is enabled by this increment. Existing local records, final payloads, recovery evidence, request keys and app caches remain retained. Logout, session expiry and an unknown mutation outcome must never clear them.

Before implementing deletion, the project owner must issue a retention period, an authoritative server-confirmed resolution rule (including disputed/recovery cases and superseded device generations), active-tab/worker protection and a recoverable deletion process. A local age or apparent submitted state alone is insufficient. The future implementation must revalidate eligibility and scope and preserve all pending, active, disputed or unknown-outcome records. We are deliberately not introducing a default duration or deleting old data now.

This is deferred work, not a completed cleanup feature. The backend has no new endpoint to implement for this decision. Existing recovery/evidence retention obligations continue unchanged.

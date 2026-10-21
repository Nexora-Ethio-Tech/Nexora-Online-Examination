# Documentation history and scope corrections

## Precisely what changed

- Feature guides were added for operations, backup/restore, future HahuCloud hosting, assistance, platform ownership and privacy shielding.
- Backend handoff entries record new API/deployment requirements without claiming live acceptance.
- Commit b7d893f repaired an accidental overwrite in the platform commit: the older handoff history was restored alongside the new platform/assistance notes. This was a documentation correction, not another backend feature.
- The ten privacy commits include architecture and verification documentation, not ten separate end-user features.
- This directory consolidates the chat changes into per-change testing guides and an exact Git inventory. It introduces no runtime behavior.

## How to verify

1. Compare the commit/file inventory with Git history for 845a8ea..ed01fe2.
2. Check that older dated integration sections remain in docs/backend-handoff.md and the new platform, assistance and privacy entries follow them.
3. Open each link from README.md; verify that the linked guide and test file exist in this checkout.
4. Confirm every unperformed deployment/database/device test is labelled pending rather than passed.
5. Run formatting and the repository check suite when changing documentation, as required by AGENTS.md.

No implementation from the other agent is certified by this documentation. The actual diff, executable tests and independently recorded staging outcomes remain the evidence.

# Exact commit and changed-file inventory

Generated from local Git history for 845a8ea..ed01fe2. A = added, M = modified, D = deleted. Paths are repository-relative. Repeated files reflect changes across commits; they are not additional features.

## 601e166 feat(operations): add verified worker, backup and Amharic tooling

```text
M	.gitignore
M	docs/VERSIONS.md
A	docs/backup-and-restore.md
A	docs/deploy-hahucloud.md
A	docs/operations-development.md
M	eslint.config.js
M	nexora-backend/docs/import-worker-operations.md
M	nexora-backend/package.json
A	nexora-backend/scripts/backup.ts
M	nexora-backend/scripts/run-worker.ts
A	nexora-backend/src/common/crypto/backup-envelope.ts
M	nexora-backend/src/modules/authoring/ai-provider.ts
M	nexora-backend/src/modules/authoring/authoring.module.ts
M	nexora-backend/src/modules/authoring/import.controller.ts
A	nexora-backend/src/modules/authoring/worker-sweep.service.ts
A	nexora-backend/test/unit/ai-provider-amharic.spec.ts
A	nexora-backend/test/unit/backup-envelope.spec.ts
A	nexora-backend/test/unit/worker-sweep.spec.ts
M	package-lock.json
M	package.json
M	src/index.css
A	tests/load/README.md
A	tests/load/k6-exam.js
```

## 8458e21 feat(assistance): add scoped staff approval and student pause workflow

```text
A	docs/invigilation-architecture-and-testing-plan.md
A	nexora-backend/migrations/022_exam_assistance.sql
M	nexora-backend/scripts/mfa-operator.ts
M	nexora-backend/src/common/errors/domain.exception.ts
M	nexora-backend/src/modules/auth/mfa-operator.ts
A	nexora-backend/src/modules/delivery/assistance-policy.ts
A	nexora-backend/src/modules/delivery/assistance.controller.ts
A	nexora-backend/src/modules/delivery/assistance.service.ts
M	nexora-backend/src/modules/delivery/delivery.module.ts
M	nexora-backend/src/modules/delivery/delivery.service.ts
M	nexora-backend/src/modules/delivery/preparation.service.ts
M	nexora-backend/src/modules/delivery/supervision.service.ts
A	nexora-backend/test/unit/assistance.spec.ts
M	src/app/DashboardLayout.tsx
M	src/app/router.tsx
A	src/features/assistance/AssistancePage.test.tsx
A	src/features/assistance/AssistancePage.tsx
A	src/features/assistance/StudentAssistance.tsx
A	src/features/assistance/api.ts
M	src/features/runner/RunnerPage.tsx
M	src/features/runner/engine.ts
M	src/features/runner/runner.test.ts
M	src/features/runner/supervision.ts
M	src/mocks/supervision.ts
```

## 538670a feat(platform): add isolated owner portal and scoped school management

```text
M	docs/backend-handoff.md
M	docs/backup-and-restore.md
A	docs/platform-owner-architecture-and-testing.md
A	docs/platform-owner.vercel.example.json
A	nexora-backend/migrations/023_platform_owner.sql
M	nexora-backend/package.json
M	nexora-backend/scripts/backup.ts
A	nexora-backend/scripts/platform-operator.ts
M	nexora-backend/src/common/crypto/mfa.ts
M	nexora-backend/src/main.ts
M	nexora-backend/src/modules/administration/scheduling.service.ts
A	nexora-backend/src/platform/platform-db.ts
A	nexora-backend/src/platform/platform-schemas.ts
A	nexora-backend/src/platform/platform.module.ts
A	nexora-backend/src/platform/platform.service.ts
A	nexora-backend/src/platform/subscription.ts
A	nexora-backend/test/unit/platform-config.spec.ts
A	nexora-backend/test/unit/platform.spec.ts
M	src/features/auth/LoginPage.tsx
A	src/features/platform/PlatformApp.test.tsx
A	src/features/platform/PlatformApp.tsx
A	src/features/platform/api.ts
M	src/main.tsx
```

## b7d893f docs: preserve historical backend handoff guidance

```text
M	docs/backend-handoff.md
```

## 40ae883 docs(privacy): define exam shield architecture and limits

```text
A	docs/exam-privacy-shield-architecture.md
```

## fa01146 feat(supervision): accept focus loss without automatic penalties

```text
M	nexora-backend/src/modules/delivery/supervision.service.ts
M	nexora-backend/test/unit/supervision.spec.ts
```

## 4ff5f79 feat(supervision): extend client interruption contract for focus loss

```text
M	src/features/runner/supervision.ts
```

## e0382ec feat(runner): persist focus loss while retaining exam evidence

```text
M	src/features/runner/engine.ts
M	src/features/runner/runner.test.ts
```

## 4f0b1b2 feat(privacy): add opaque shield and scoped exam print rules

```text
A	src/features/runner/privacy-shield.css
```

## efaea6b feat(privacy): add concealment and deliberate resume controls

```text
A	src/features/runner/ExamPrivacyShield.test.tsx
A	src/features/runner/ExamPrivacyShield.tsx
```

## 41d534c feat(privacy): add repeated attempt watermark without login details

```text
A	src/features/runner/ExamWatermark.test.tsx
A	src/features/runner/ExamWatermark.tsx
```

## b51c14f feat(runner): integrate privacy shield into active exam

```text
M	src/features/runner/RunnerPage.tsx
```

## 852c47d test(privacy): verify offline resume and print concealment in browsers

```text
M	tests/e2e/demo.spec.ts
```

## ed01fe2 docs(privacy): record testing evidence and rollout requirements

```text
M	docs/backend-handoff.md
A	docs/exam-privacy-shield-testing.md
```

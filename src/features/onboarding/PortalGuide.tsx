import type { Role } from '@/features/auth/schemas';
import { guides, guideRevision } from './guide';
import { GuidedTour } from './GuidedTour';
export function PortalGuide({
  schoolId,
  userId,
  role,
  iconOnly = false,
}: {
  schoolId: string;
  userId: string;
  role: Role;
  iconOnly?: boolean;
}) {
  return (
    <GuidedTour
      iconOnly={iconOnly}
      storageKey={'nexora:guide:' + schoolId + ':' + userId + ':' + role}
      revision={guideRevision(role)}
      steps={guides[role].map((step) => ({
        ...step,
        target: step.targets ?? 'nav a[href="' + step.path.split('?')[0] + '"]',
        fallbackTarget: 'nav a[href="' + step.path.split('?')[0] + '"]',
      }))}
    />
  );
}

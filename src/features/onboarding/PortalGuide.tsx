import type { Role } from '@/features/auth/schemas';
import { guides, guideRevision } from './guide';
import { GuidedTour } from './GuidedTour';
export function PortalGuide({
  schoolId,
  userId,
  role,
}: {
  schoolId: string;
  userId: string;
  role: Role;
}) {
  return (
    <GuidedTour
      storageKey={'nexora:guide:' + schoolId + ':' + userId + ':' + role}
      revision={guideRevision(role)}
      steps={guides[role].map((step) => ({
        ...step,
        target: 'nav a[href="' + step.path.split('?')[0] + '"]',
      }))}
    />
  );
}

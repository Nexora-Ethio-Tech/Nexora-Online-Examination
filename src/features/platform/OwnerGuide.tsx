import { GuidedTour } from '@/features/onboarding/GuidedTour';
import { tourPresentation } from '@/features/onboarding/tour-appearance';
export const ownerSteps = [
  {
    title: 'Your schools',
    body: 'Each school card shows its permanent numeric school code. Choose a school to manage its subscription, access and administrators. Use Next page to see more schools.',
    target: '#owner-schools h2',
  },
  {
    title: 'Add a school',
    body: 'Enter the school name, address name and administrator login ID, three names, phone and recovery email. Share the one-time password and private 30-minute setup link with that administrator. They verify their credentials, scan their QR code and confirm enrollment.',
    target: '#owner-add-school',
  },
  {
    title: 'Manage school access',
    body: 'Open a school card. Manage subscription changes its plan; Suspend school stops school access. Edit administrator information updates names and contact details. Recover school administrator resets access after you verify their identity. Changes need your authenticator code. Suspension, reactivation and administrator recovery also require a reason. Subscription notes are optional; creating schools or administrators and editing contact details need no reason.',
    target: '#owner-schools h2',
  },
  {
    title: 'Check processing',
    body: 'Processing status shows waiting and completed work. A waiting count alone does not mean a worker is running. Active schools are included automatically by the worker. Check this area if exam files stay waiting.',
    target: '#owner-health h2',
  },
  {
    title: 'Review activity',
    body: 'Owner activity records administrative changes and their reasons. Export this page saves only the currently displayed events.',
    target: '#owner-activity h2',
  },
];
export function OwnerGuide({ owner }: { owner: string }) {
  return (
    <GuidedTour
      storageKey={`nexora:owner-guide:${owner}`}
      revision={JSON.stringify({ presentation: tourPresentation, steps: ownerSteps })}
      label="Owner guide"
      steps={ownerSteps}
    />
  );
}

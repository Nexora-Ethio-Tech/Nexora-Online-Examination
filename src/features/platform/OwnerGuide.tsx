import { GuidedTour } from '@/features/onboarding/GuidedTour';
export const ownerSteps = [
  {
    title: 'Your schools',
    body: 'Choose a school card to manage its subscription, access and administrators. Use Next page to see more schools.',
    target: '#owner-schools',
  },
  {
    title: 'Add a school',
    body: 'Enter the school name, a short unique address name and its first administrator. Save the one-time login details privately and complete authenticator setup before handing over.',
    target: '#owner-add-school',
  },
  {
    title: 'Manage school access',
    body: 'Open a school card. Manage subscription changes its plan; Suspend school stops school access. Recover school administrator resets access after you verify their identity. Each change needs your authenticator code and a reason.',
    target: '#owner-schools',
  },
  {
    title: 'Check processing',
    body: 'Processing status shows waiting and completed work. A waiting count alone does not mean a worker is running. Check this area if exam files stay waiting.',
    target: '#owner-health',
  },
  {
    title: 'Review activity',
    body: 'Owner activity records administrative changes and their reasons. Export this page saves only the currently displayed events.',
    target: '#owner-activity',
  },
];
export function OwnerGuide({ owner }: { owner: string }) {
  return (
    <GuidedTour
      storageKey={`nexora:owner-guide:${owner}`}
      revision={JSON.stringify(ownerSteps)}
      label="Owner guide"
      steps={ownerSteps.map((step) => ({
        ...step,
        open: () =>
          document
            .querySelector(step.target)
            ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      }))}
    />
  );
}

export type TourTarget = { target: string | readonly string[]; fallbackTarget?: string };

function visible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== 'hidden' &&
    style.visibility !== 'collapse' &&
    !element.closest('[hidden], [inert], [aria-hidden="true"]')
  );
}

/** Prefer the feature, then its navigation link; an open menu owns its own focus layer. */
export function tourTarget(step: TourTarget) {
  const find = (selector: string, scope: ParentNode = document) =>
    [...scope.querySelectorAll<HTMLElement>(selector)].find(visible);
  const scope = find('[data-tour-menu]') ?? document;
  const selectors = typeof step.target === 'string' ? [step.target] : step.target;
  for (const selector of selectors) {
    const element = find(selector, scope);
    if (element) return { element, kind: 'feature' as const };
  }
  if (step.fallbackTarget) {
    const element = find(step.fallbackTarget, scope);
    if (element) return { element, kind: 'navigation' as const };
  }
  if (step.fallbackTarget || selectors.some((selector) => selector.startsWith('nav '))) {
    const element = find('[data-tour-navigation]');
    if (element) return { element, kind: 'menu' as const };
  }
  return null;
}

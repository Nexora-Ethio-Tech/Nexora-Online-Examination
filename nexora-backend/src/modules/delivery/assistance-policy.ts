import { DomainException } from '../../common/errors/domain.exception';

export function assertAssistanceOpen(
  attempt: { state: string; suspended: boolean; deadline_at: Date },
  now: Date,
) {
  if (attempt.suspended)
    throw DomainException.conflict(
      'ATTEMPT_SUSPENDED',
      'Only an administrator can lift an administrative suspension',
    );
  if (attempt.state !== 'active' || now >= attempt.deadline_at)
    throw DomainException.conflict(
      'ALREADY_FINALIZED',
      'Assistance cannot reopen a closed exam or extend its deadline',
    );
}

export function assertAssistanceMatches(
  attempt: { device_generation: number; supervision_revision: number; assistance_paused: boolean },
  request: { device_generation: number; supervision_revision: number; expires_at: Date },
  now: Date,
) {
  if (
    !attempt.assistance_paused ||
    attempt.device_generation !== request.device_generation ||
    attempt.supervision_revision !== request.supervision_revision ||
    now >= request.expires_at
  )
    throw DomainException.conflict(
      'REVISION_CONFLICT',
      'Request expired or the workstation changed; ask for a fresh request',
    );
}

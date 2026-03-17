import type { AgentOsRepository } from '../persistence/repository.js';
import { DEFAULT_FOUNDER_PREFERENCES } from './founder-preferences-defaults.js';
import type {
  FounderPreferencesInput,
  FounderPreferencesRecord
} from './founder-preferences-types.js';

export function mergeFounderPreferences(args: {
  tenantId: string;
  actorUserId: string;
  existing?: FounderPreferencesRecord | null;
  input?: FounderPreferencesInput;
  timestamp: string;
}): FounderPreferencesRecord {
  const current = args.existing ?? {
    id: 'founder-preferences:default',
    tenantId: args.tenantId,
    actorUserId: args.actorUserId,
    ...DEFAULT_FOUNDER_PREFERENCES,
    createdAtIso: args.timestamp,
    updatedAtIso: args.timestamp
  };

  return {
    ...current,
    tenantId: args.tenantId,
    actorUserId: args.actorUserId,
    notification: {
      ...current.notification,
      ...(args.input?.notification ?? {})
    },
    digest: {
      ...current.digest,
      ...(args.input?.digest ?? {})
    },
    opportunity: {
      ...current.opportunity,
      ...(args.input?.opportunity ?? {})
    },
    recommendation: {
      ...current.recommendation,
      ...(args.input?.recommendation ?? {})
    },
    scheduler: {
      ...current.scheduler,
      ...(args.input?.scheduler ?? {})
    },
    delivery: {
      ...current.delivery,
      ...(args.input?.delivery ?? {})
    },
    escalation: {
      ...current.escalation,
      ...(args.input?.escalation ?? {})
    },
    updatedAtIso: args.timestamp
  };
}

export class AaliyahFounderPreferencesResolver {
  constructor(private readonly repository: AgentOsRepository) {}

  async resolve(args: {
    tenantId: string;
    actorUserId?: string;
    generatedAt?: string;
  }): Promise<FounderPreferencesRecord> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const existing = await this.repository.getFounderPreferenceControls({ tenantId: args.tenantId });
    return mergeFounderPreferences({
      tenantId: args.tenantId,
      actorUserId: existing?.actorUserId ?? args.actorUserId ?? 'founder',
      existing,
      timestamp: generatedAt
    });
  }
}

import { randomUUID } from 'node:crypto';

import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import { AaliyahAccessControlService } from './access.js';
import { buildAaliyahCrmSummary } from './crm-summary.js';
import { AaliyahCrmAuditService } from './crm-audit.js';
import {
  AaliyahCrmAccessDeniedError,
  AaliyahCrmConflictError,
  AaliyahCrmInternalError,
  AaliyahCrmInvalidModeError,
  AaliyahCrmNotFoundError,
  AaliyahCrmValidationError
} from './crm-errors.js';
import type {
  AaliyahCrmAccountResult,
  AaliyahCrmAddNoteInput,
  AaliyahCrmContactResult,
  AaliyahCrmContextResult,
  AaliyahCrmCreateAccountInput,
  AaliyahCrmCreateContactInput,
  AaliyahCrmNoteResult,
  AaliyahCrmUpdateAccountInput,
  AaliyahCrmUpdateContactInput
} from './crm-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';

export class AaliyahCrmService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahCrmAuditService;

  constructor(private readonly repository: AgentOsRepository, diagnostics?: AaliyahDiagnosticsService) {
    this.audit = new AaliyahCrmAuditService(diagnostics);
  }

  async createContact(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    input: AaliyahCrmCreateContactInput;
    generatedAt?: string;
  }): Promise<AaliyahCrmContactResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const input = this.normalizeCreateContactInput(args.input);
      const existing = await this.repository.getAaliyahCrmContactByEmail({ tenantId: args.tenantId, email: input.email });
      if (existing) {
        throw new AaliyahCrmConflictError('CRM contact already exists for this email.');
      }
      if (input.accountId) {
        await this.requireAccount(args.tenantId, input.accountId);
      }
      const contact = await this.repository.createAaliyahCrmContact({
        tenantId: args.tenantId,
        contactId: `crm-contact:${randomUUID()}`,
        principalId: args.actorId,
        ...input,
        createdAt: generatedAt
      });
      await this.audit.record({
        eventType: 'aaliyah.crm.contact.created',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildContactMetadata({ email: contact.email, contactId: contact.id, accountId: contact.accountId, resultCode: 'ok' })
      });
      return { ok: true, contact, message: 'CRM contact created successfully.' };
    } catch (error) {
      return this.normalizeFailure<AaliyahCrmContactResult>({ tenantId: args.tenantId, actorId: args.actorId, mode: args.mode, generatedAt, error, metadata: this.audit.buildContactMetadata({ email: args.input.email ?? null }) });
    }
  }

  async updateContact(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    contactId: string;
    input: AaliyahCrmUpdateContactInput;
    generatedAt?: string;
  }): Promise<AaliyahCrmContactResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const existing = await this.requireContact(args.tenantId, args.contactId);
      const input = this.normalizeUpdateContactInput(args.input);
      if (input.email && input.email !== existing.email) {
        const duplicate = await this.repository.getAaliyahCrmContactByEmail({ tenantId: args.tenantId, email: input.email });
        if (duplicate && duplicate.id !== existing.id) {
          throw new AaliyahCrmConflictError('CRM contact already exists for this email.');
        }
      }
      if (input.accountId) {
        await this.requireAccount(args.tenantId, input.accountId);
      }
      const contact = await this.repository.updateAaliyahCrmContact({
        tenantId: args.tenantId,
        contactId: args.contactId,
        email: input.email ?? existing.email,
        firstName: input.firstName ?? existing.firstName,
        lastName: input.lastName ?? existing.lastName,
        accountId: input.accountId ?? existing.accountId,
        roleTitle: input.roleTitle ?? existing.roleTitle,
        phone: input.phone ?? existing.phone,
        status: input.status ?? existing.status,
        relationshipStage: input.relationshipStage ?? existing.relationshipStage,
        lastTouchedAt: input.lastTouchedAt ?? existing.lastTouchedAt,
        nextActionAt: input.nextActionAt ?? existing.nextActionAt,
        notesSummary: input.notesSummary ?? existing.notesSummary,
        updatedAt: generatedAt
      });
      await this.audit.record({
        eventType: 'aaliyah.crm.contact.updated',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildContactMetadata({ email: contact.email, contactId: contact.id, accountId: contact.accountId, resultCode: 'ok' })
      });
      return { ok: true, contact, message: 'CRM contact updated successfully.' };
    } catch (error) {
      return this.normalizeFailure<AaliyahCrmContactResult>({ tenantId: args.tenantId, actorId: args.actorId, mode: args.mode, generatedAt, error, metadata: this.audit.buildContactMetadata({ contactId: args.contactId, email: args.input.email ?? null }) });
    }
  }

  async getContactById(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    contactId: string;
    generatedAt?: string;
  }): Promise<AaliyahCrmContactResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const contact = await this.requireContact(args.tenantId, args.contactId);
      return { ok: true, contact, message: 'CRM contact loaded successfully.' };
    } catch (error) {
      return this.normalizeFailure<AaliyahCrmContactResult>({ tenantId: args.tenantId, actorId: args.actorId, mode: args.mode, generatedAt, error, metadata: this.audit.buildContactMetadata({ contactId: args.contactId }) });
    }
  }

  async getContactByEmail(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    email: string;
    generatedAt?: string;
  }): Promise<AaliyahCrmContactResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const email = this.normalizeEmail(args.email);
      const contact = await this.repository.getAaliyahCrmContactByEmail({ tenantId: args.tenantId, email });
      if (!contact) {
        throw new AaliyahCrmNotFoundError('CRM contact was not found.');
      }
      return { ok: true, contact, message: 'CRM contact loaded successfully.' };
    } catch (error) {
      return this.normalizeFailure<AaliyahCrmContactResult>({ tenantId: args.tenantId, actorId: args.actorId, mode: args.mode, generatedAt, error, metadata: this.audit.buildContactMetadata({ email: args.email }) });
    }
  }

  async createAccount(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    input: AaliyahCrmCreateAccountInput;
    generatedAt?: string;
  }): Promise<AaliyahCrmAccountResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const input = this.normalizeCreateAccountInput(args.input);
      const account = await this.repository.createAaliyahCrmAccount({
        tenantId: args.tenantId,
        accountId: `crm-account:${randomUUID()}`,
        ...input,
        createdAt: generatedAt
      });
      await this.audit.record({
        eventType: 'aaliyah.crm.account.created',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildAccountMetadata({ accountId: account.id, name: account.name, resultCode: 'ok' })
      });
      return { ok: true, account, message: 'CRM account created successfully.' };
    } catch (error) {
      return this.normalizeFailure<AaliyahCrmAccountResult>({ tenantId: args.tenantId, actorId: args.actorId, mode: args.mode, generatedAt, error, metadata: this.audit.buildAccountMetadata({ name: args.input.name ?? null }) });
    }
  }

  async updateAccount(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    accountId: string;
    input: AaliyahCrmUpdateAccountInput;
    generatedAt?: string;
  }): Promise<AaliyahCrmAccountResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      await this.requireAccount(args.tenantId, args.accountId);
      const input = this.normalizeUpdateAccountInput(args.input);
      const existing = await this.requireAccount(args.tenantId, args.accountId);
      const account = await this.repository.updateAaliyahCrmAccount({
        tenantId: args.tenantId,
        accountId: args.accountId,
        name: input.name ?? existing.name,
        website: input.website ?? existing.website,
        industry: input.industry ?? existing.industry,
        status: input.status ?? existing.status,
        notesSummary: input.notesSummary ?? existing.notesSummary,
        updatedAt: generatedAt
      });
      await this.audit.record({
        eventType: 'aaliyah.crm.account.updated',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildAccountMetadata({ accountId: account.id, name: account.name, resultCode: 'ok' })
      });
      return { ok: true, account, message: 'CRM account updated successfully.' };
    } catch (error) {
      return this.normalizeFailure<AaliyahCrmAccountResult>({ tenantId: args.tenantId, actorId: args.actorId, mode: args.mode, generatedAt, error, metadata: this.audit.buildAccountMetadata({ accountId: args.accountId, name: args.input.name ?? null }) });
    }
  }

  async getAccountById(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    accountId: string;
    generatedAt?: string;
  }): Promise<AaliyahCrmAccountResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const account = await this.requireAccount(args.tenantId, args.accountId);
      return { ok: true, account, message: 'CRM account loaded successfully.' };
    } catch (error) {
      return this.normalizeFailure<AaliyahCrmAccountResult>({ tenantId: args.tenantId, actorId: args.actorId, mode: args.mode, generatedAt, error, metadata: this.audit.buildAccountMetadata({ accountId: args.accountId }) });
    }
  }

  async addNote(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    input: AaliyahCrmAddNoteInput;
    generatedAt?: string;
  }): Promise<AaliyahCrmNoteResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const input = this.normalizeNoteInput(args.input);
      if (input.contactId) {
        await this.requireContact(args.tenantId, input.contactId);
      }
      if (input.accountId) {
        await this.requireAccount(args.tenantId, input.accountId);
      }
      const note = await this.repository.createAaliyahCrmNote({
        tenantId: args.tenantId,
        noteId: `crm-note:${randomUUID()}`,
        contactId: input.contactId ?? null,
        accountId: input.accountId ?? null,
        authorPrincipalId: args.actorId,
        note: input.note,
        createdAt: generatedAt
      });
      await this.audit.record({
        eventType: 'aaliyah.crm.note.created',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildNoteMetadata({ contactId: note.contactId, accountId: note.accountId, note: note.note, resultCode: 'ok' })
      });
      return { ok: true, note, message: 'CRM note created successfully.' };
    } catch (error) {
      return this.normalizeFailure<AaliyahCrmNoteResult>({ tenantId: args.tenantId, actorId: args.actorId, mode: args.mode, generatedAt, error, metadata: this.audit.buildNoteMetadata({ contactId: args.input.contactId ?? null, accountId: args.input.accountId ?? null, note: args.input.note ?? null }) });
    }
  }

  async getContextByEmail(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    email: string;
    generatedAt?: string;
  }): Promise<AaliyahCrmContextResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const email = this.normalizeEmail(args.email);
      const contact = await this.repository.getAaliyahCrmContactByEmail({ tenantId: args.tenantId, email });
      if (!contact) {
        throw new AaliyahCrmNotFoundError('CRM contact was not found.');
      }
      const account = contact.accountId ? await this.repository.getAaliyahCrmAccountById({ tenantId: args.tenantId, accountId: contact.accountId }) : null;
      const recentNotes = await this.repository.listAaliyahCrmNotesForContext({
        tenantId: args.tenantId,
        contactId: contact.id,
        accountId: contact.accountId,
        limit: 3
      });
      const context = buildAaliyahCrmSummary({ contact, account, recentNotes });
      await this.audit.record({
        eventType: 'aaliyah.crm.context.requested',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildContactMetadata({ email, contactId: contact.id, accountId: contact.accountId, resultCode: 'ok' })
      });
      return { ok: true, context, message: 'CRM context loaded successfully.' };
    } catch (error) {
      return this.normalizeFailure<AaliyahCrmContextResult>({ tenantId: args.tenantId, actorId: args.actorId, mode: args.mode, generatedAt, error, metadata: this.audit.buildContactMetadata({ email: args.email ?? null }) });
    }
  }

  private assertFounderModeAccess(principalContext: 'founder' | 'operator', mode: FounderBriefingMode) {
    try {
      this.access.assertFounderModeAccess({ principalContext, activeMode: mode, requestedMode: mode, detailLevel: mode === 'founder' ? 'summary' : 'detail' });
    } catch (error) {
      if (error instanceof Error && error.message === 'aaliyah_principal_context_denied') {
        throw new AaliyahCrmAccessDeniedError();
      }
      throw new AaliyahCrmInvalidModeError();
    }
  }

  private normalizeCreateContactInput(input: AaliyahCrmCreateContactInput) {
    const email = this.normalizeEmail(input.email);
    return {
      email,
      firstName: this.optionalString(input.firstName),
      lastName: this.optionalString(input.lastName),
      accountId: this.optionalString(input.accountId),
      roleTitle: this.optionalString(input.roleTitle),
      phone: this.optionalString(input.phone),
      status: input.status ?? 'lead',
      relationshipStage: input.relationshipStage ?? 'new',
      lastTouchedAt: this.optionalIso(input.lastTouchedAt),
      nextActionAt: this.optionalIso(input.nextActionAt),
      notesSummary: this.optionalString(input.notesSummary)
    };
  }

  private normalizeUpdateContactInput(input: AaliyahCrmUpdateContactInput) {
    const normalized = {
      email: input.email !== undefined ? this.normalizeEmail(input.email) : undefined,
      firstName: input.firstName !== undefined ? this.optionalString(input.firstName) : undefined,
      lastName: input.lastName !== undefined ? this.optionalString(input.lastName) : undefined,
      accountId: input.accountId !== undefined ? this.optionalString(input.accountId) : undefined,
      roleTitle: input.roleTitle !== undefined ? this.optionalString(input.roleTitle) : undefined,
      phone: input.phone !== undefined ? this.optionalString(input.phone) : undefined,
      status: input.status,
      relationshipStage: input.relationshipStage,
      lastTouchedAt: input.lastTouchedAt !== undefined ? this.optionalIso(input.lastTouchedAt) : undefined,
      nextActionAt: input.nextActionAt !== undefined ? this.optionalIso(input.nextActionAt) : undefined,
      notesSummary: input.notesSummary !== undefined ? this.optionalString(input.notesSummary) : undefined
    };
    if (Object.values(normalized).every((value) => value === undefined)) {
      throw new AaliyahCrmValidationError('CRM input failed validation.');
    }
    return normalized;
  }

  private normalizeCreateAccountInput(input: AaliyahCrmCreateAccountInput) {
    const name = input.name?.trim();
    if (!name) {
      throw new AaliyahCrmValidationError('CRM input failed validation.');
    }
    return {
      name,
      website: input.website !== undefined ? this.optionalWebsite(input.website) : null,
      industry: this.optionalString(input.industry),
      status: input.status ?? 'active',
      notesSummary: this.optionalString(input.notesSummary)
    };
  }

  private normalizeUpdateAccountInput(input: AaliyahCrmUpdateAccountInput) {
    const normalized = {
      name: input.name !== undefined ? (input.name.trim() || (() => { throw new AaliyahCrmValidationError('CRM input failed validation.'); })()) : undefined,
      website: input.website !== undefined ? this.optionalWebsite(input.website) : undefined,
      industry: input.industry !== undefined ? this.optionalString(input.industry) : undefined,
      status: input.status,
      notesSummary: input.notesSummary !== undefined ? this.optionalString(input.notesSummary) : undefined
    };
    if (Object.values(normalized).every((value) => value === undefined)) {
      throw new AaliyahCrmValidationError('CRM input failed validation.');
    }
    return normalized;
  }

  private normalizeNoteInput(input: AaliyahCrmAddNoteInput) {
    const note = input.note?.trim();
    if (!note || (!input.contactId && !input.accountId)) {
      throw new AaliyahCrmValidationError('CRM input failed validation.');
    }
    return {
      contactId: this.optionalString(input.contactId),
      accountId: this.optionalString(input.accountId),
      note
    };
  }

  private normalizeEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new AaliyahCrmValidationError('CRM input failed validation.');
    }
    return normalized;
  }

  private optionalString(value: string | undefined): string | null {
    if (value === undefined) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private optionalIso(value: string | undefined): string | null {
    if (value === undefined) {
      return null;
    }
    if (value.trim().length === 0) {
      return null;
    }
    if (!Number.isFinite(Date.parse(value))) {
      throw new AaliyahCrmValidationError('CRM input failed validation.');
    }
    return new Date(value).toISOString();
  }

  private optionalWebsite(value: string | undefined): string | null {
    const normalized = this.optionalString(value);
    if (!normalized) {
      return null;
    }
    try {
      const parsed = new URL(normalized.startsWith('http') ? normalized : `https://${normalized}`);
      return parsed.toString();
    } catch {
      throw new AaliyahCrmValidationError('CRM input failed validation.');
    }
  }

  private async requireContact(tenantId: string, contactId: string) {
    const contact = await this.repository.getAaliyahCrmContactById({ tenantId, contactId });
    if (!contact) {
      throw new AaliyahCrmNotFoundError('CRM contact was not found.');
    }
    return contact;
  }

  private async requireAccount(tenantId: string, accountId: string) {
    const account = await this.repository.getAaliyahCrmAccountById({ tenantId, accountId });
    if (!account) {
      throw new AaliyahCrmNotFoundError('CRM account was not found.');
    }
    return account;
  }

  private async normalizeFailure<T>(args: {
    tenantId: string;
    actorId: string;
    mode: FounderBriefingMode;
    generatedAt: string;
    error: unknown;
    metadata: Record<string, unknown>;
  }): Promise<T> {
    let failure;
    if (args.error instanceof AaliyahCrmAccessDeniedError || args.error instanceof AaliyahCrmInvalidModeError) {
      failure = {
        ok: false,
        denialCode: args.error.denialCode,
        errorCode: null,
        retryable: false,
        message: args.error.message
      };
      await this.audit.record({ eventType: 'aaliyah.crm.denied', principalId: args.actorId, tenantId: args.tenantId, mode: args.mode, timestamp: args.generatedAt, metadata: { ...args.metadata, resultCode: args.error.denialCode } });
      return failure as T;
    }

    const normalized =
      args.error instanceof AaliyahCrmValidationError ||
      args.error instanceof AaliyahCrmNotFoundError ||
      args.error instanceof AaliyahCrmConflictError
        ? args.error
        : args.error instanceof Error && args.error.message === 'aaliyah_crm_contact_conflict'
          ? new AaliyahCrmConflictError('CRM contact already exists for this email.')
          : new AaliyahCrmInternalError();

    failure = {
      ok: false,
      denialCode: null,
      errorCode: normalized.errorCode,
      retryable: false,
      message: normalized.message
    };
    await this.audit.record({ eventType: 'aaliyah.crm.failed', principalId: args.actorId, tenantId: args.tenantId, mode: args.mode, timestamp: args.generatedAt, metadata: { ...args.metadata, resultCode: normalized.errorCode } });
    return failure as T;
  }
}

/**
 * Company YappChatt account — SPEC-144 (SCOPE-144) T006, T007, T008, T009, T013.
 *
 * A wxKanban company owns its team chat through ONE YappChatt account made from its
 * contact email (or linked, when that email already has one). wxKanban is the
 * membership source of truth:
 *
 *   company group   = every active company user (ADMIN → admin, else member)
 *                     + every consulting member with a current assignment on one of the
 *                       company's projects (member)
 *   a project room  = every active company user
 *                     + only the consulting members assigned to THAT project
 *
 * Everything YappChatt-side goes through the consumer API (contract C1). The companion
 * being absent (`companion_unavailable`) is detected by the first call of an operation,
 * before anything local is written, so nothing half-completes (FR-011).
 *
 * Data access sits behind `CompanyYappchattStore` and YappChatt behind `CompanionClient`
 * so the rules are unit-tested without a database or a network (tests never touch
 * production — the repo `.env` points at it).
 */
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { NextFunction, Response } from 'express';
import { db } from '~/db/client.js';
import { companies } from '~/db/schema/company.js';
import { userprofiles } from '~/db/schema/userprofiles.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { companysubscriptions } from '~/db/schema/companysubscription.js';
import { companyauditlogs } from '~/db/schema/companyauditlog.js';
import { engagements } from '~/db/schema/engagement.js';
import { engagementassignments } from '~/db/schema/engagementassignment.js';
import { subassignments } from '~/db/schema/subassignment.js';
import { projectusers } from '~/db/schema/projectuser.js';
import { projectrooms } from '~/db/schema/projectroom.js';
import { userinvitations } from '~/db/schema/userinvitation.js';
import {
  YappchattBrokerError,
  isCompanionUnavailable,
  consumerAccount,
  consumerCreateGroup,
  consumerPutGroupMember,
  consumerRemoveGroupMember,
  consumerCreateRoom,
  consumerAddRoomMember,
  consumerRemoveRoomMember,
  consumerRetireRoom,
  operatorSession,
  mintAgentToken,
  type CompanyGroupRole,
} from '~/server/lib/yappchattBroker.js';
import { sqlEqU } from '~/server/lib/sqlHelpers.js';
import type { AuthRequest } from '~/server/middleware/auth.js';
import { logger } from '~/server/lib/logger.js';

// [SCOPE 144 / T013] BEGIN — audit actions (contract C3, FR-010)
/** The closed list of `companyauditlogs.action` values this feature writes (contract C3). */
export type YappchattAuditAction =
  | 'yappchatt.account.created'
  | 'yappchatt.account.linked'
  | 'yappchatt.member.added'
  | 'yappchatt.member.removed'
  | 'yappchatt.member.role'
  | 'yappchatt.room.created'
  | 'yappchatt.room.retired'
  | 'yappchatt.session.refused'
  | 'yappchatt.decision.accepted'
  | 'yappchatt.decision.refused';

/** One audit row. `newvalue` holds ids only — never a token or the consumer secret. */
export interface YappchattAuditEntry {
  companyid: string;
  action: YappchattAuditAction;
  changedby: string | null;
  newvalue: Record<string, string | number | boolean | null>;
  previousvalue?: Record<string, string | number | boolean | null>;
  description: string;
}
// [SCOPE 144 / T013] END

// [SCOPE 144 / T006] BEGIN — types, store and client interfaces
export class CompanyYappchattError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly extra: Record<string, string | null> = {},
  ) {
    super(message);
    this.name = 'CompanyYappchattError';
  }
}

export interface CompanyChatRecord {
  id: string;
  name: string;
  contactemail: string;
  yappchattuserid: string | null;
  yappchattemail: string | null;
  yappchattlinkedat: Date | null;
  yappchattgroupid: string | null;
}

export interface ChatPerson {
  userid: string;
  email: string;
  name: string | null;
  yappchattuserid: string | null;
}

export interface CompanyUser extends ChatPerson {
  usertype: string;
}

export interface ConsultingMember extends ChatPerson {
  /** The company's projects this person currently has an assignment on. */
  projectids: string[];
}

export interface LiveRoom {
  id: string;
  projectid: string;
  agentname: string;
  conversationid: string;
  owneryappchattid: string | null;
}

export interface CompanyYappchattStore {
  getCompany(companyId: string): Promise<CompanyChatRecord | null>;
  /** The paid seat count from the company's current subscription, or null when none is recorded. */
  seatLimit(companyId: string): Promise<number | null>;
  /** Store the account and group ids. Only writes while no group is recorded; false = someone else won. */
  linkCompany(
    companyId: string,
    v: { userid: string; email: string; groupid: string; linkedat: Date },
  ): Promise<boolean>;
  /** Active company users. */
  companyUsers(companyId: string): Promise<CompanyUser[]>;
  /** Consulting members with a current assignment on one of the company's projects (active engagement). */
  consultingMembers(companyId: string): Promise<ConsultingMember[]>;
  /**
   * Everyone with a stored YappChatt id who has ever belonged: company users (active or
   * not) and consulting members ever assigned to its projects. Removal candidates.
   */
  knownPeople(companyId: string): Promise<ChatPerson[]>;
  setPersonYappchattId(userid: string, yappchattuserid: string): Promise<void>;
  /** Last group role written per YappChatt id, from this feature's own audit rows. */
  lastGroupRoles(companyId: string): Promise<Map<string, CompanyGroupRole>>;
  /** The company's non-retired project rooms. */
  liveRooms(companyId: string): Promise<LiveRoom[]>;
  liveRoom(projectId: string, agentName: string): Promise<LiveRoom | null>;
  markRoomRetired(roomId: string, retiredat: Date): Promise<void>;
  /** Insert a live room row; null when a live row for (project, agent) already exists. */
  insertRoom(v: {
    projectid: string;
    agentname: string;
    conversationid: string;
    owneryappchattid: string;
  }): Promise<string | null>;
  touchRoomMint(roomId: string): Promise<void>;
  projectCompany(projectId: string): Promise<string | null>;
  /** The active user of the company holding this YappChatt id. */
  personByYappchattId(
    companyId: string,
    yappchattuserid: string,
  ): Promise<{ userid: string; name: string; usertype: string } | null>;
  isCurrentProjectMember(projectId: string, userid: string): Promise<boolean>;
  companyForInvitationToken(token: string): Promise<string | null>;
  companyForEngagement(engagementId: string): Promise<string | null>;
  audit(entry: YappchattAuditEntry): Promise<void>;
}

export interface CompanionClient {
  account(email: string, displayName?: string): Promise<{ userid: string; created: boolean }>;
  createGroup(ownerUserid: string, name: string, seatlimit: number | null): Promise<{ orgid: string }>;
  putGroupMember(orgid: string, userid: string, role: CompanyGroupRole): Promise<{ added: boolean }>;
  removeGroupMember(orgid: string, userid: string): Promise<{ removed: boolean }>;
  createRoom(ownerUserid: string, title: string, memberIds: string[]): Promise<{ conversationid: string }>;
  addRoomMember(conversationid: string, userid: string): Promise<{ added: boolean }>;
  removeRoomMember(conversationid: string, userid: string): Promise<{ removed: boolean }>;
  retireRoom(conversationid: string): Promise<{ retiredat: string }>;
  /** A short-lived session for minting the agent token. Never stored (SPEC-144 Data Requirements). */
  session(email: string): Promise<string>;
  mintAgentToken(session: string, conversationid: string): Promise<string>;
}

export interface SyncFailure {
  userid: string;
  reason: string;
}

export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
  failed: SyncFailure[];
  /** Set when nothing was synced because the company has no account yet. */
  skipped?: 'no_company_account';
}

export interface CompanyYappchattStatus {
  connected: boolean;
  /** The account's email when connected; the contact email the button will use when not. */
  email: string | null;
  yappchattUserId: string | null;
  groupId: string | null;
  linkedAt: string | null;
  canManage: boolean;
}

export interface ConnectCompanyResult {
  connected: true;
  outcome: 'created' | 'linked' | 'already';
  email: string;
  yappchattUserId: string;
  groupId: string;
  members: { added: number; updated: number; removed: number; failed: SyncFailure[] };
}

export interface CompanyRoomResult {
  conversationId: string;
  agentToken?: string;
  minted: boolean;
  operatorEmail: string;
  ownerYappchattId: string;
  /** The old room retired and replaced on this call (FR-007). */
  replacedConversationId?: string;
}

export interface ApproverResult {
  approver: boolean;
  name: string | null;
  role: 'ADMIN' | 'TEAM_MANAGER' | null;
}

const emptySync = (): SyncResult => ({ added: 0, updated: 0, removed: 0, failed: [] });

function reasonOf(err: unknown): string {
  if (err instanceof YappchattBrokerError) return err.code;
  if (err instanceof Error) return err.message;
  return 'unknown_error';
}

const groupRoleFor = (usertype: string): CompanyGroupRole => (usertype === 'ADMIN' ? 'admin' : 'member');
// [SCOPE 144 / T006] END

// [SCOPE 144 / T006] BEGIN — CompanyYappchattService
// MODIFIED-BY: [SCOPE 144 / T007] — membership sync and the sync-after-request trigger
// MODIFIED-BY: [SCOPE 144 / T008] — ensureCompanyRoom: company-owned rooms, no-account 409, retire and replace
// MODIFIED-BY: [SCOPE 144 / T009] — approver: the Room Approver check
// MODIFIED-BY: [SCOPE 144 / T013] — audit writer
export class CompanyYappchattService {
  /** One sync at a time per company; a sync asked for during one runs after it. */
  private readonly chains = new Map<string, Promise<SyncResult>>();

  constructor(
    private readonly store: CompanyYappchattStore,
    private readonly client: CompanionClient,
  ) {}

  /** GET /api/company/yappchatt (contract C3). */
  async status(companyId: string, usertype: string | undefined): Promise<CompanyYappchattStatus> {
    const company = await this.store.getCompany(companyId);
    if (!company) throw new CompanyYappchattError('company_not_found', 404, 'Company not found.');
    const connected = Boolean(company.yappchattuserid && company.yappchattgroupid);
    return {
      connected,
      email: connected ? (company.yappchattemail ?? company.contactemail) : company.contactemail,
      yappchattUserId: connected ? company.yappchattuserid : null,
      groupId: connected ? company.yappchattgroupid : null,
      linkedAt: connected && company.yappchattlinkedat ? company.yappchattlinkedat.toISOString() : null,
      canManage: usertype === 'ADMIN',
    };
  }

  /**
   * POST /api/company/yappchatt — create or link the company account from the contact
   * email, create the company group, store both ids, then sync members (FR-002, FR-003).
   * A connected company is `already`: no account or group call, nothing relinked.
   */
  async connectCompany(companyId: string, actorUserId: string | null): Promise<ConnectCompanyResult> {
    const company = await this.store.getCompany(companyId);
    if (!company) throw new CompanyYappchattError('company_not_found', 404, 'Company not found.');

    let outcome: ConnectCompanyResult['outcome'] = 'already';
    let userid = company.yappchattuserid;
    let groupid = company.yappchattgroupid;
    let email = company.yappchattemail ?? company.contactemail;

    if (!userid || !groupid) {
      // YappChatt first, in this order, and nothing local until both succeed: a missing
      // companion fails the first call and leaves the company untouched (FR-011).
      if (!userid) {
        const account = await this.client.account(company.contactemail, company.name);
        userid = account.userid;
        email = company.contactemail;
        outcome = account.created ? 'created' : 'linked';
      }
      const seatlimit = await this.store.seatLimit(companyId);
      const group = await this.client.createGroup(userid, company.name, seatlimit);
      groupid = group.orgid;

      const won = await this.store.linkCompany(companyId, { userid, email, groupid, linkedat: new Date() });
      if (!won) {
        // Two presses at once: the other one stored its ids first. Ours is the orphan.
        logger.warn({ companyId, orphanGroup: groupid }, 'concurrent YappChatt connect — orphaned group left in YappChatt');
        const current = await this.store.getCompany(companyId);
        if (!current?.yappchattuserid || !current.yappchattgroupid) {
          throw new CompanyYappchattError('link_conflict', 409, 'The company account could not be stored. Try again.');
        }
        userid = current.yappchattuserid;
        groupid = current.yappchattgroupid;
        email = current.yappchattemail ?? current.contactemail;
        outcome = 'already';
      } else if (outcome !== 'already') {
        await this.audit({
          companyid: companyId,
          action: outcome === 'created' ? 'yappchatt.account.created' : 'yappchatt.account.linked',
          changedby: actorUserId,
          newvalue: { yappchattuserid: userid, groupid, email, seatlimit },
          description:
            outcome === 'created'
              ? `Company YappChatt account created for ${email}; company group created.`
              : `Existing YappChatt account for ${email} linked as the company account; company group created.`,
        });
      }
    }

    const members = await this.syncCompany(companyId, actorUserId);
    const { added, updated, removed, failed } = members;
    return { connected: true, outcome, email, yappchattUserId: userid, groupId: groupid, members: { added, updated, removed, failed } };
  }

  /** Membership sync (T007), serialized per company. */
  syncCompany(companyId: string, actorUserId: string | null = null): Promise<SyncResult> {
    const prev = this.chains.get(companyId) ?? Promise.resolve(emptySync());
    const next = prev.catch(() => emptySync()).then(() => this.runSync(companyId, actorUserId));
    this.chains.set(companyId, next);
    const clear = (): void => {
      if (this.chains.get(companyId) === next) this.chains.delete(companyId);
    };
    next.then(clear, clear);
    return next;
  }

  /** The sync for flows it must never block or fail: logs, never throws. */
  async syncQuietly(companyId: string, actorUserId: string | null, trigger: string): Promise<SyncResult | null> {
    try {
      const result = await this.syncCompany(companyId, actorUserId);
      if (result.failed.length) {
        logger.warn({ companyId, trigger, failed: result.failed }, 'YappChatt membership sync left people out');
      }
      return result;
    } catch (err) {
      logger.warn({ companyId, trigger, reason: reasonOf(err) }, 'YappChatt membership sync failed');
      return null;
    }
  }
  // ── Membership sync (T007) ──
  private async runSync(companyId: string, actorUserId: string | null): Promise<SyncResult> {
    const result = emptySync();
    const company = await this.store.getCompany(companyId);
    if (!company?.yappchattuserid || !company.yappchattgroupid) {
      return { ...result, skipped: 'no_company_account' };
    }
    const owner = company.yappchattuserid;
    const orgid = company.yappchattgroupid;

    const users = await this.store.companyUsers(companyId);
    const consultants = await this.store.consultingMembers(companyId);

    // 1. Each person's YappChatt id, created or linked by their email (C1.1), stored once.
    const ycid = new Map<string, string>();
    const failedIds = new Set<string>();
    const fail = (userid: string, reason: string): void => {
      result.failed.push({ userid, reason });
      failedIds.add(userid);
    };
    for (const person of [...users, ...consultants]) {
      if (ycid.has(person.userid) || failedIds.has(person.userid)) continue;
      if (person.yappchattuserid) {
        ycid.set(person.userid, person.yappchattuserid);
        continue;
      }
      try {
        const account = await this.client.account(person.email, person.name ?? undefined);
        await this.store.setPersonYappchattId(person.userid, account.userid);
        ycid.set(person.userid, account.userid);
      } catch (err) {
        if (isCompanionUnavailable(err)) throw err;
        fail(person.userid, reasonOf(err));
      }
    }

    // 2. The group: company users with their role, consulting members as members.
    const desiredGroup = new Map<string, { userid: string; role: CompanyGroupRole }>();
    for (const u of users) {
      const id = ycid.get(u.userid);
      if (id) desiredGroup.set(id, { userid: u.userid, role: groupRoleFor(u.usertype) });
    }
    for (const c of consultants) {
      const id = ycid.get(c.userid);
      if (id && !desiredGroup.has(id)) desiredGroup.set(id, { userid: c.userid, role: 'member' });
    }
    desiredGroup.delete(owner); // the owner's role is set by C1.2 only

    const lastRoles = await this.store.lastGroupRoles(companyId);
    for (const [id, { userid, role }] of desiredGroup) {
      try {
        const r = await this.client.putGroupMember(orgid, id, role);
        if (r.added) {
          result.added++;
          await this.audit({
            companyid: companyId,
            action: 'yappchatt.member.added',
            changedby: actorUserId,
            newvalue: { scope: 'group', orgid, userid, yappchattuserid: id, role },
            description: `Added to the company YappChatt group as ${role}.`,
          });
        } else {
          const previous = lastRoles.get(id);
          if (previous && previous !== role) {
            result.updated++;
            await this.audit({
              companyid: companyId,
              action: 'yappchatt.member.role',
              changedby: actorUserId,
              previousvalue: { role: previous },
              newvalue: { scope: 'group', orgid, userid, yappchattuserid: id, role },
              description: `Company YappChatt group role changed from ${previous} to ${role}.`,
            });
          }
        }
      } catch (err) {
        if (isCompanionUnavailable(err)) throw err;
        const reason = reasonOf(err);
        // Reported, never silent (FR-004 risk): the plan's seats are full.
        if (reason === 'seat_limit_reached') {
          logger.warn({ companyId, userid }, 'YappChatt company group seat limit reached');
        }
        fail(userid, reason);
      }
    }

    // Removal: anyone known whose entitlement ended (user removed, engagement ended).
    const known = await this.store.knownPeople(companyId);
    const knownIds = new Map<string, string>(); // yappchatt id → wxKanban user id
    for (const p of known) if (p.yappchattuserid) knownIds.set(p.yappchattuserid, p.userid);
    for (const [id, userid] of ycid) knownIds.set(id, userid);
    knownIds.delete(owner);

    for (const [id, userid] of knownIds) {
      if (desiredGroup.has(id) || failedIds.has(userid)) continue;
      try {
        const r = await this.client.removeGroupMember(orgid, id);
        if (r.removed) {
          result.removed++;
          await this.audit({
            companyid: companyId,
            action: 'yappchatt.member.removed',
            changedby: actorUserId,
            newvalue: { scope: 'group', orgid, userid, yappchattuserid: id },
            description: 'Removed from the company YappChatt group.',
          });
        }
      } catch (err) {
        if (isCompanionUnavailable(err)) throw err;
        fail(userid, reasonOf(err));
      }
    }

    // 3. Company-owned project rooms. A room with another or no owner is left alone here;
    // the next connect retires and replaces it (FR-007).
    const companyIds = new Set<string>();
    for (const u of users) {
      const id = ycid.get(u.userid);
      if (id) companyIds.add(id);
    }
    const rooms = (await this.store.liveRooms(companyId)).filter((r) => r.owneryappchattid === owner);
    for (const room of rooms) {
      const desired = new Set(companyIds);
      for (const c of consultants) {
        const id = ycid.get(c.userid);
        if (id && c.projectids.includes(room.projectid)) desired.add(id);
      }
      desired.delete(owner);

      // A room retired or deleted YappChatt-side is skipped; the next connect replaces it.
      const skipRoom = (err: unknown): boolean => {
        if (isCompanionUnavailable(err)) throw err;
        const reason = reasonOf(err);
        if (reason === 'room_retired' || reason === 'room_not_found') {
          logger.warn({ companyId, conversationid: room.conversationid, reason }, 'YappChatt room sync skipped');
          return true;
        }
        return false;
      };
      let skipped = false;
      for (const id of desired) {
        const userid = knownIds.get(id) ?? '';
        try {
          const r = await this.client.addRoomMember(room.conversationid, id);
          if (r.added) {
            result.added++;
            await this.audit({
              companyid: companyId,
              action: 'yappchatt.member.added',
              changedby: actorUserId,
              newvalue: { scope: 'room', conversationid: room.conversationid, projectid: room.projectid, userid, yappchattuserid: id },
              description: 'Added to the project YappChatt room.',
            });
          }
        } catch (err) {
          if (skipRoom(err)) {
            skipped = true;
            break;
          }
          fail(userid, reasonOf(err));
        }
      }
      if (skipped) continue;
      for (const [id, userid] of knownIds) {
        if (desired.has(id)) continue;
        try {
          const r = await this.client.removeRoomMember(room.conversationid, id);
          if (r.removed) {
            result.removed++;
            await this.audit({
              companyid: companyId,
              action: 'yappchatt.member.removed',
              changedby: actorUserId,
              newvalue: { scope: 'room', conversationid: room.conversationid, projectid: room.projectid, userid, yappchattuserid: id },
              description: 'Removed from the project YappChatt room.',
            });
          }
        } catch (err) {
          if (skipRoom(err)) break;
          fail(userid, reasonOf(err));
        }
      }
    }

    logger.info(
      { companyId, added: result.added, updated: result.updated, removed: result.removed, failed: result.failed.length },
      'YappChatt membership synced',
    );
    return result;
  }

  /** The YappChatt ids a new room for this project starts with (owner excluded). */
  private async roomMemberIds(companyId: string, projectId: string, owner: string): Promise<string[]> {
    const ids = new Set<string>();
    for (const u of await this.store.companyUsers(companyId)) if (u.yappchattuserid) ids.add(u.yappchattuserid);
    for (const c of await this.store.consultingMembers(companyId)) {
      if (c.yappchattuserid && c.projectids.includes(projectId)) ids.add(c.yappchattuserid);
    }
    ids.delete(owner);
    return [...ids];
  }
  // ── Rooms under the company account (T008) ──
  /**
   * The live (project, agent) room, always owned by the company account (FR-005):
   * no account → 409 `no_company_account` unless `createCompanyAccount` (FR-006); a room
   * with another or no recorded owner is retired and replaced (FR-007); every connect
   * syncs membership first (FR-004) without ever failing the connect.
   */
  async ensureCompanyRoom(args: {
    companyId: string;
    projectId: string;
    projectName: string;
    agentName: string;
    operatorEmail: string;
    actorUserId: string | null;
    mintAgentToken?: boolean;
    createCompanyAccount?: boolean;
  }): Promise<CompanyRoomResult> {
    const { companyId, projectId, projectName, agentName, operatorEmail, actorUserId } = args;

    let company = await this.store.getCompany(companyId);
    if (!company) throw new CompanyYappchattError('company_not_found', 404, 'Company not found.');
    if (!company.yappchattuserid || !company.yappchattgroupid) {
      if (!args.createCompanyAccount) {
        throw new CompanyYappchattError(
          'no_company_account',
          409,
          `This company has no YappChatt account yet. Create the company YappChatt account now, using ${company.contactemail}?`,
          { contactEmail: company.contactemail },
        );
      }
      await this.connectCompany(companyId, actorUserId); // creates or links, then syncs
      company = await this.store.getCompany(companyId);
      if (!company?.yappchattuserid || !company.yappchattgroupid) {
        throw new CompanyYappchattError('link_conflict', 409, 'The company account could not be stored. Try again.');
      }
    } else {
      await this.syncQuietly(companyId, actorUserId, 'agent-connect');
    }
    const owner = company.yappchattuserid;
    const ownerEmail = company.yappchattemail ?? company.contactemail;

    let replacedConversationId: string | undefined;
    let existing = await this.store.liveRoom(projectId, agentName);
    if (existing && existing.owneryappchattid !== owner) {
      // Retire in YappChatt first: a missing companion stops here with nothing changed.
      const retired = await this.client.retireRoom(existing.conversationid);
      await this.store.markRoomRetired(existing.id, new Date(retired.retiredat));
      await this.audit({
        companyid: companyId,
        action: 'yappchatt.room.retired',
        changedby: actorUserId,
        previousvalue: { owneryappchattid: existing.owneryappchattid },
        newvalue: { projectid: projectId, agentname: agentName, conversationid: existing.conversationid },
        description: `Room "${projectName} · ${agentName}" retired (not owned by the company account); history kept.`,
      });
      replacedConversationId = existing.conversationid;
      existing = null;
    }

    if (existing && !args.mintAgentToken) {
      return { conversationId: existing.conversationid, minted: false, operatorEmail, ownerYappchattId: owner, replacedConversationId };
    }

    const session = await this.client.session(ownerEmail);

    if (existing) {
      // The agent lost its copy: mint again under the company account (FR-015 unchanged).
      const agentToken = await this.client.mintAgentToken(session, existing.conversationid);
      await this.store.touchRoomMint(existing.id);
      return { conversationId: existing.conversationid, agentToken, minted: true, operatorEmail, ownerYappchattId: owner };
    }

    const memberIds = await this.roomMemberIds(companyId, projectId, owner);
    const { conversationid } = await this.client.createRoom(owner, `${projectName} · ${agentName}`, memberIds);
    const agentToken = await this.client.mintAgentToken(session, conversationid);

    const insertedId = await this.store.insertRoom({ projectid: projectId, agentname: agentName, conversationid, owneryappchattid: owner });
    if (!insertedId) {
      // A concurrent connect bound a live room first. Theirs wins; ours is retired.
      logger.warn({ projectId, agentName, orphan: conversationid }, 'concurrent room bind — retiring the orphaned room');
      await this.client.retireRoom(conversationid).catch((err: unknown) =>
        logger.warn({ conversationid, reason: reasonOf(err) }, 'orphaned room could not be retired'),
      );
      const winner = await this.store.liveRoom(projectId, agentName);
      if (!winner) {
        throw new CompanyYappchattError('room_bind_conflict', 409, 'The project room could not be recorded. Try again.');
      }
      const retoken = await this.client.mintAgentToken(session, winner.conversationid);
      return {
        conversationId: winner.conversationid,
        agentToken: retoken,
        minted: true,
        operatorEmail,
        ownerYappchattId: winner.owneryappchattid ?? owner,
        replacedConversationId,
      };
    }

    await this.audit({
      companyid: companyId,
      action: 'yappchatt.room.created',
      changedby: actorUserId,
      newvalue: {
        projectid: projectId,
        agentname: agentName,
        conversationid,
        owneryappchattid: owner,
        members: memberIds.length,
        replacedconversationid: replacedConversationId ?? null,
      },
      description: `Room "${projectName} · ${agentName}" created under the company YappChatt account.`,
    });
    logger.info({ projectId, agentName, conversationid }, 'company-owned agent room bound');
    return { conversationId: conversationid, agentToken, minted: true, operatorEmail, ownerYappchattId: owner, replacedConversationId };
  }
  // ── Room Approver check, FR-008 (T009) ──
  /**
   * Is this YappChatt user a Room Approver on the token's project: an active ADMIN of
   * the project's company, or a TEAM_MANAGER with a current projectusers row on it.
   * The bridge asks before recording a decision, so the answer is audited as the
   * decision accepted or refused (FR-010).
   */
  async approver(
    token: { projectid: string; customerid: string },
    yappchattUserId: string,
  ): Promise<ApproverResult> {
    const companyId = (await this.store.projectCompany(token.projectid)) ?? token.customerid;
    const person = await this.store.personByYappchattId(companyId, yappchattUserId);

    let result: ApproverResult = { approver: false, name: null, role: null };
    if (person?.usertype === 'ADMIN') {
      result = { approver: true, name: person.name, role: 'ADMIN' };
    } else if (person?.usertype === 'TEAM_MANAGER' && (await this.store.isCurrentProjectMember(token.projectid, person.userid))) {
      result = { approver: true, name: person.name, role: 'TEAM_MANAGER' };
    }

    await this.audit({
      companyid: companyId,
      action: result.approver ? 'yappchatt.decision.accepted' : 'yappchatt.decision.refused',
      changedby: person?.userid ?? null,
      newvalue: {
        projectid: token.projectid,
        yappchattuserid: yappchattUserId,
        userid: person?.userid ?? null,
        role: result.role,
      },
      description: result.approver
        ? `Room decision accepted from ${result.name} (${result.role}).`
        : 'Room decision refused: the poster is not a Room Approver on this project.',
    });
    return result;
  }
  // ── Audit writer (T013) ──
  /** An audit write failure is logged, never thrown: the YappChatt change already happened. */
  private async audit(entry: YappchattAuditEntry): Promise<void> {
    try {
      await this.store.audit(entry);
    } catch (err) {
      logger.error({ companyId: entry.companyid, action: entry.action, reason: reasonOf(err) }, 'YappChatt audit write failed');
    }
  }
  // ── Sync triggers after user and engagement changes (T007) ──
  /**
   * Resolve the company a finished user or engagement request changed, then sync it.
   * Used by `yappchattSyncObserver`; never throws.
   */
  async syncAfterRequest(trigger: SyncTrigger, req: AuthRequest): Promise<void> {
    let companyId: string | null = null;
    if (trigger.kind === 'session-company') companyId = req.companyid ?? null;
    else if (trigger.kind === 'invitation') companyId = await this.store.companyForInvitationToken(trigger.id);
    else companyId = await this.store.companyForEngagement(trigger.id);
    if (!companyId) return;
    await this.syncQuietly(companyId, req.userid ?? null, trigger.name);
  }
}
// [SCOPE 144 / T006] END

// [SCOPE 144 / T007] BEGIN — sync trigger matching
export interface SyncTrigger {
  /** Where the company comes from: the caller's session, an invitation token, or an engagement id. */
  kind: 'session-company' | 'invitation' | 'engagement';
  id: string;
  name: string;
}

const TRIGGERS: Array<{ method: string; re: RegExp; kind: SyncTrigger['kind']; name: string }> = [
  // Users added, removed, re-activated or re-roled (SCOPE-014 company and user management).
  { method: 'POST', re: /^\/api\/team\/invite\/([^/]+)\/accept$/, kind: 'invitation', name: 'team-invite-accept' },
  { method: 'POST', re: /^\/api\/invitations\/accept\/([^/]+)$/, kind: 'invitation', name: 'invitation-accept' },
  { method: 'POST', re: /^\/api\/team\/([^/]+)\/(?:remove|status|role)$/, kind: 'session-company', name: 'team-user-change' },
  { method: 'POST', re: /^\/api\/admin\/users()$/, kind: 'session-company', name: 'admin-user-add' },
  { method: 'PUT', re: /^\/api\/admin\/users\/([^/]+)\/role$/, kind: 'session-company', name: 'admin-user-role' },
  { method: 'DELETE', re: /^\/api\/admin\/users\/([^/]+)$/, kind: 'session-company', name: 'admin-user-remove' },
  // Consulting engagements: state changes, assignments and sub-assignments (SPEC-037).
  { method: 'POST', re: /^\/api\/engagements\/([^/]+)\/(?:pause|resume|disable|enable|end)$/, kind: 'engagement', name: 'engagement-state' },
  { method: 'POST', re: /^\/api\/engagements\/([^/]+)\/assignments$/, kind: 'engagement', name: 'engagement-assign' },
  { method: 'DELETE', re: /^\/api\/engagements\/([^/]+)\/assignments\/[^/]+$/, kind: 'engagement', name: 'engagement-unassign' },
  { method: 'POST', re: /^\/api\/engagements\/([^/]+)\/assignments\/[^/]+\/subassign$/, kind: 'engagement', name: 'engagement-subassign' },
  { method: 'DELETE', re: /^\/api\/engagements\/([^/]+)\/subassignments\/[^/]+$/, kind: 'engagement', name: 'engagement-unsubassign' },
];

export function matchSyncTrigger(method: string, path: string): SyncTrigger | null {
  const clean = path.split('?')[0].replace(/\/+$/, '');
  for (const t of TRIGGERS) {
    if (t.method !== method.toUpperCase()) continue;
    const m = t.re.exec(clean);
    if (m) return { kind: t.kind, id: decodeURIComponent(m[1] ?? ''), name: t.name };
  }
  return null;
}
// [SCOPE 144 / T007] END

// [SCOPE 144 / T007] BEGIN — Drizzle store
const AUDIT_ROLE_ACTIONS: YappchattAuditAction[] = ['yappchatt.member.added', 'yappchatt.member.role'];

export const drizzleCompanyYappchattStore: CompanyYappchattStore = {
  async getCompany(companyId) {
    const [row] = await db
      .select({
        id: companies.id,
        name: companies.name,
        contactemail: companies.contactemail,
        yappchattuserid: companies.yappchattuserid,
        yappchattemail: companies.yappchattemail,
        yappchattlinkedat: companies.yappchattlinkedat,
        yappchattgroupid: companies.yappchattgroupid,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    return row ?? null;
  },

  async seatLimit(companyId) {
    const [row] = await db
      .select({ seats: companysubscriptions.activeuserlimit })
      .from(companysubscriptions)
      .where(
        and(eq(companysubscriptions.companyid, companyId), inArray(companysubscriptions.status, ['active', 'trialing'])),
      )
      .orderBy(desc(companysubscriptions.createdat))
      .limit(1);
    return row?.seats ?? null;
  },

  async linkCompany(companyId, v) {
    const rows = await db
      .update(companies)
      .set({
        yappchattuserid: v.userid,
        yappchattemail: v.email,
        yappchattgroupid: v.groupid,
        yappchattlinkedat: v.linkedat,
        updatedat: new Date(),
      })
      .where(and(eq(companies.id, companyId), isNull(companies.yappchattgroupid)))
      .returning({ id: companies.id });
    return rows.length > 0;
  },

  async companyUsers(companyId) {
    const rows = await db
      .select({
        userid: userprofiles.id,
        email: userprofiles.emailaddr,
        name: userprofiles.fullname,
        usertype: userprofiles.usertype,
        yappchattuserid: userprofiles.yappchattuserid,
      })
      .from(userprofiles)
      .where(and(eq(userprofiles.companyid, companyId), eq(userprofiles.active, true)));
    return rows;
  },

  async consultingMembers(companyId) {
    const rows = await db
      .select({
        userid: userprofiles.id,
        email: userprofiles.emailaddr,
        name: userprofiles.fullname,
        yappchattuserid: userprofiles.yappchattuserid,
        projectid: engagementassignments.projectid,
      })
      .from(subassignments)
      .innerJoin(engagementassignments, eq(subassignments.engagementassignmentid, engagementassignments.id))
      .innerJoin(engagements, eq(engagements.id, engagementassignments.engagementid))
      .innerJoin(companyprojects, eq(companyprojects.id, engagementassignments.projectid))
      .innerJoin(userprofiles, eq(userprofiles.id, subassignments.consultingmemberid))
      .where(
        and(
          sqlEqU(engagements.clientcompanyid, companyId),
          sqlEqU(companyprojects.companyid, companyId),
          eq(engagements.state, 'active'),
          isNull(subassignments.removedat),
          isNull(engagementassignments.removedat),
          eq(userprofiles.active, true),
        ),
      );
    const byUser = new Map<string, ConsultingMember>();
    for (const r of rows) {
      const m = byUser.get(r.userid) ?? { userid: r.userid, email: r.email, name: r.name, yappchattuserid: r.yappchattuserid, projectids: [] };
      if (!m.projectids.includes(r.projectid)) m.projectids.push(r.projectid);
      byUser.set(r.userid, m);
    }
    return [...byUser.values()];
  },

  async knownPeople(companyId) {
    const own = await db
      .select({
        userid: userprofiles.id,
        email: userprofiles.emailaddr,
        name: userprofiles.fullname,
        yappchattuserid: userprofiles.yappchattuserid,
      })
      .from(userprofiles)
      .where(eq(userprofiles.companyid, companyId));
    const consulted = await db
      .selectDistinct({
        userid: userprofiles.id,
        email: userprofiles.emailaddr,
        name: userprofiles.fullname,
        yappchattuserid: userprofiles.yappchattuserid,
      })
      .from(subassignments)
      .innerJoin(engagementassignments, eq(subassignments.engagementassignmentid, engagementassignments.id))
      .innerJoin(engagements, eq(engagements.id, engagementassignments.engagementid))
      .innerJoin(userprofiles, eq(userprofiles.id, subassignments.consultingmemberid))
      .where(sqlEqU(engagements.clientcompanyid, companyId));
    return [...own, ...consulted].filter((p) => p.yappchattuserid);
  },

  async setPersonYappchattId(userid, yappchattuserid) {
    await db.update(userprofiles).set({ yappchattuserid }).where(eq(userprofiles.id, userid));
  },

  async lastGroupRoles(companyId) {
    const rows = await db
      .select({ newvalue: companyauditlogs.newvalue })
      .from(companyauditlogs)
      .where(and(eq(companyauditlogs.companyid, companyId), inArray(companyauditlogs.action, AUDIT_ROLE_ACTIONS)))
      .orderBy(asc(companyauditlogs.timestamp));
    const roles = new Map<string, CompanyGroupRole>();
    for (const { newvalue } of rows) {
      if (!newvalue || typeof newvalue !== 'object') continue;
      const v = newvalue as Record<string, unknown>;
      if (v.scope !== 'group' || typeof v.yappchattuserid !== 'string') continue;
      if (v.role === 'admin' || v.role === 'member') roles.set(v.yappchattuserid, v.role);
    }
    return roles;
  },

  async liveRooms(companyId) {
    return db
      .select({
        id: projectrooms.id,
        projectid: projectrooms.projectid,
        agentname: projectrooms.agentname,
        conversationid: projectrooms.conversationid,
        owneryappchattid: projectrooms.owneryappchattid,
      })
      .from(projectrooms)
      .innerJoin(companyprojects, eq(companyprojects.id, projectrooms.projectid))
      .where(and(eq(companyprojects.companyid, companyId), isNull(projectrooms.retiredat)));
  },

  async liveRoom(projectId, agentName) {
    const [row] = await db
      .select({
        id: projectrooms.id,
        projectid: projectrooms.projectid,
        agentname: projectrooms.agentname,
        conversationid: projectrooms.conversationid,
        owneryappchattid: projectrooms.owneryappchattid,
      })
      .from(projectrooms)
      .where(and(eq(projectrooms.projectid, projectId), eq(projectrooms.agentname, agentName), isNull(projectrooms.retiredat)))
      .limit(1);
    return row ?? null;
  },

  async markRoomRetired(roomId, retiredat) {
    await db.update(projectrooms).set({ retiredat, updatedat: new Date() }).where(eq(projectrooms.id, roomId));
  },

  async insertRoom(v) {
    const rows = await db
      .insert(projectrooms)
      .values({ ...v, agenttokenmintedat: new Date() })
      .onConflictDoNothing()
      .returning({ id: projectrooms.id });
    return rows[0]?.id ?? null;
  },

  async touchRoomMint(roomId) {
    await db.update(projectrooms).set({ agenttokenmintedat: new Date(), updatedat: new Date() }).where(eq(projectrooms.id, roomId));
  },

  async projectCompany(projectId) {
    const [row] = await db
      .select({ companyid: companyprojects.companyid })
      .from(companyprojects)
      .where(eq(companyprojects.id, projectId))
      .limit(1);
    return row?.companyid ?? null;
  },

  async personByYappchattId(companyId, yappchattuserid) {
    const [row] = await db
      .select({
        userid: userprofiles.id,
        fullname: userprofiles.fullname,
        email: userprofiles.emailaddr,
        usertype: userprofiles.usertype,
      })
      .from(userprofiles)
      .where(
        and(
          eq(userprofiles.companyid, companyId),
          eq(userprofiles.yappchattuserid, yappchattuserid),
          eq(userprofiles.active, true),
        ),
      )
      .limit(1);
    return row ? { userid: row.userid, name: row.fullname || row.email, usertype: row.usertype } : null;
  },

  async isCurrentProjectMember(projectId, userid) {
    const [row] = await db
      .select({ id: projectusers.id })
      .from(projectusers)
      .where(and(eq(projectusers.projectid, projectId), eq(projectusers.userid, userid), isNull(projectusers.removedat)))
      .limit(1);
    return Boolean(row);
  },

  async companyForInvitationToken(token) {
    const [row] = await db
      .select({ companyid: userinvitations.companyid })
      .from(userinvitations)
      .where(eq(userinvitations.token, token))
      .limit(1);
    return row?.companyid ?? null;
  },

  async companyForEngagement(engagementId) {
    const [row] = await db
      .select({ companyid: engagements.clientcompanyid })
      .from(engagements)
      .where(sqlEqU(engagements.id, engagementId))
      .limit(1);
    return row?.companyid ?? null;
  },

  async audit(entry) {
    await db.insert(companyauditlogs).values({
      companyid: entry.companyid,
      action: entry.action,
      changedby: entry.changedby,
      previousvalue: entry.previousvalue ?? null,
      newvalue: entry.newvalue,
      description: entry.description,
    });
  },
};
// [SCOPE 144 / T007] END

// [SCOPE 144 / T005] BEGIN — companion client over the broker (contract C1)
export const brokerCompanionClient: CompanionClient = {
  account: (email, displayName) => consumerAccount(email, displayName),
  createGroup: (owner, name, seatlimit) => consumerCreateGroup(owner, name, seatlimit),
  putGroupMember: (orgid, userid, role) => consumerPutGroupMember(orgid, userid, role),
  removeGroupMember: (orgid, userid) => consumerRemoveGroupMember(orgid, userid),
  createRoom: (owner, title, memberIds) => consumerCreateRoom(owner, title, memberIds),
  addRoomMember: (conversationid, userid) => consumerAddRoomMember(conversationid, userid),
  removeRoomMember: (conversationid, userid) => consumerRemoveRoomMember(conversationid, userid),
  retireRoom: (conversationid) => consumerRetireRoom(conversationid),
  session: (email) => operatorSession(email),
  mintAgentToken: (session, conversationid) => mintAgentToken(session, conversationid),
};
// [SCOPE 144 / T005] END

export const companyYappchattService = new CompanyYappchattService(drizzleCompanyYappchattStore, brokerCompanionClient);

// [SCOPE 144 / T007] BEGIN — yappchattSyncObserver
/**
 * Sync after a user or engagement change finishes successfully. Mounted once in app.ts,
 * ahead of the routers it watches, so the user and engagement routes are not edited:
 * it runs after the response is sent, so it can never block or fail those flows.
 */
export function yappchattSyncObserver(req: AuthRequest, res: Response, next: NextFunction): void {
  const trigger = matchSyncTrigger(req.method, req.originalUrl);
  if (trigger) {
    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      companyYappchattService.syncAfterRequest(trigger, req).catch((err: unknown) =>
        logger.warn({ trigger: trigger.name, reason: reasonOf(err) }, 'YappChatt sync trigger failed'),
      );
    });
  }
  next();
}
// [SCOPE 144 / T007] END

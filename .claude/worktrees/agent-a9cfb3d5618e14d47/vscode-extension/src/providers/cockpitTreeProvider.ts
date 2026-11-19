import * as vscode from 'vscode';
import { resolveProjectContext } from '../services/projectContext.js';
import { resolveToken } from '../services/auth.js';
import { CockpitMcpClient } from '../services/mcpClient.js';
import { loadCommandCatalog, type HelpCatalog, type HelpCommand, type HelpParam } from '../services/helpCatalog.js';
import { loadVideoCatalog, loadMarketingVideoCatalog, splitOnboarding, type DocVideo, type MarketingVideoGroups } from '../services/videosCatalog.js'; // [SCOPE 042 / Videos] + [SCOPE 066 / T008]
import { loadFaqCatalog, type FaqEntry } from '../services/faqCatalog.js'; // [SCOPE 066 / T008]
import { loadGuideCatalog, type GuideEntry, type GuideVariant } from '../services/guidesCatalog.js'; // [SCOPE 066 / Guides]
import { checkCommands, type CommandsStatus } from '../services/commandsInstall.js'; // [SCOPE 060 / Cockpit]
import {
  checkKitUpdate,
  resolveKitInstallState, // [SCOPE 083 / T006]
  type KitUpdateStatus,
} from '../services/kitUpdate.js'; // [SCOPE 019 / R15]
import { checkGitStatus, type GitStatus } from '../services/gitStatus.js'; // [SCOPE 091 / T001]
import { checkSystemHealth, type SystemHealth } from '../services/healthCheck.js'; // [SCOPE 094 / T002-T003]
import { loadNightlyCard, type NightlyCard, type NightlyRow } from '../services/nightlySummary.js'; // [SCOPE 140 / T012]
import type { CockpitScope, CockpitSummary, CockpitTask, MyFeedbackItem } from '../types.js';
import { scopeResourceUri } from './scopeDecorations.js'; // [SCOPE 058 / T013]

type NodeKind =
  | 'scope'
  | 'task'
  | 'message'
  | 'feedback-group'
  | 'feedback'
  | 'incoming-group' // [SCOPE 043 amendment] customer feedback into a sink we own
  | 'help-group'
  | 'help-category'
  | 'help-item'
  | 'help-param'
  | 'videos-group' // [SCOPE 042 / Videos]
  | 'video-item' // [SCOPE 042 / Videos]
  | 'video-category' // [SCOPE 066 / T008] — Open / Training marketing-video subtree
  | 'faq-group' // [SCOPE 066 / T008]
  | 'faq-item' // [SCOPE 066 / T008]
  | 'guides-group' // [SCOPE 066 / Guides] — downloadable conversion/migration guides
  | 'guide-item' // [SCOPE 066 / Guides] — one guide, expands into its languages
  | 'guide-variant' // [SCOPE 066 / Guides] — one language's PDF
  | 'devplan-group' // [SCOPE 081 / T005]
  | 'devplan-item' // [SCOPE 081 / T005]
  | 'commands-setup' // [SCOPE 060 / Cockpit]
  | 'community-help' // [SCOPE 079 / T05]
  | 'manual' // [SCOPE 141 / T027] — opens the wxKanban Manual
  | 'kit-update' // [SCOPE 019 / R15]
  | 'kit-install' // [SCOPE 083 / T008] — no kit in this folder
  | 'kit-blocked' // [SCOPE 083 / T009] — update held back by a guard
  | 'kit-check-failed' // [SCOPE 083 / T010] — the check could not run
  | 'scopes-group' // [SCOPE 091 / T005]
  | 'git-group' // [SCOPE 091 / T002]
  | 'git-commit' // [SCOPE 091 / T002]
  | 'health-group' // [SCOPE 094 / T002-T003]
  | 'health-item' // [SCOPE 094 / T002-T003]
  | 'nightly-group' // [SCOPE 140 / T012] the morning summary card
  | 'nightly-item'; // [SCOPE 140 / T012]
type LoadState = 'unloaded' | 'ok' | 'empty' | 'no-project' | 'no-token' | 'error';

interface ComputedState {
  state: Exclude<LoadState, 'unloaded'>;
  summary: CockpitSummary | null;
  activeScope: string | undefined;
  // [SCOPE 043 / T010] the submitter's own feedback (best-effort; null when unfetched)
  feedback: MyFeedbackItem[];
  incoming: MyFeedbackItem[];
  gitStatus: GitStatus; // [SCOPE 091 / T003] unpushed-commit state, folded into the signature
  health: SystemHealth; // [SCOPE 094 / T002-T003] orchestrator + MCP reachability
  errorMsg: string;
  signature: string;
}

// [SCOPE 042 / T016] BEGIN — CockpitNode (one item type for scopes, tasks, and state messages)
// MODIFIED-BY: [SCOPE 140 / T012] — carries the nightly card's rows
export class CockpitNode extends vscode.TreeItem {
  /** [SCOPE 140 / T012] the rows a nightly-group node expands into. */
  public nightlyRows?: NightlyRow[];
  constructor(
    public readonly kind: NodeKind,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly scope?: CockpitScope,
    public readonly task?: CockpitTask,
    public readonly feedbackItem?: MyFeedbackItem, // [SCOPE 043 / T010]
    public readonly helpCommand?: HelpCommand, // [SCOPE 042 / Help]
    public readonly helpItems?: HelpCommand[], // [SCOPE 042 / Help] — a category's commands
    public readonly video?: DocVideo, // [SCOPE 042 / Videos]
    public readonly faq?: FaqEntry, // [SCOPE 066 / T008]
    public readonly videoItems?: DocVideo[], // [SCOPE 066 / T008] — a category's videos
    public readonly devplanItems?: NonNullable<CockpitSummary['devplan']>, // [SCOPE 081 / T005]
    public readonly guide?: GuideEntry, // [SCOPE 066 / Guides]
    public readonly guideVariant?: GuideVariant, // [SCOPE 066 / Guides]
  ) {
    super(label, collapsibleState);
  }
}
// [SCOPE 042 / T016] END

// [SCOPE 042 / T016] BEGIN — CockpitTreeProvider (active scope pinned -> scopes -> incomplete tasks)
// MODIFIED-BY: [SCOPE 141 / T027] — a Manual row after Community Help (FR-017)
// MODIFIED-BY: [SCOPE 140 / T012] — the nightly morning summary card at the top
// MODIFIED-BY: [SCOPE 139 / T012] — the Videos section leads with an Onboarding group
export class CockpitTreeProvider implements vscode.TreeDataProvider<CockpitNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<CockpitNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private summary: CockpitSummary | null = null;
  private activeScope: string | undefined;
  private feedback: MyFeedbackItem[] = []; // [SCOPE 043 / T010]
  // [SCOPE 043 amendment] Reports OTHER companies filed into a sink this company
  // owns. Empty for everyone who does not own one, so the section simply never
  // appears for a customer.
  private incoming: MyFeedbackItem[] = [];
  private helpCatalog: HelpCatalog = { standard: [], extended: [] }; // [SCOPE 042 / Help]
  private videos: DocVideo[] = []; // [SCOPE 042 / Videos]
  private videosLoaded = false; // [SCOPE 042 / Videos] — cache the network fetch until refresh
  private marketingVideos: MarketingVideoGroups = { open: [], training: [] }; // [SCOPE 066 / T008]
  private faqs: FaqEntry[] = []; // [SCOPE 066 / T008]
  private guides: GuideEntry[] = []; // [SCOPE 066 / Guides]
  private commandsStatus: CommandsStatus | null = null; // [SCOPE 060 / Cockpit]
  private kitUpdate: KitUpdateStatus | null = null; // [SCOPE 019 / R15]
  private gitStatus: GitStatus | null = null; // [SCOPE 091 / T002]
  private health: SystemHealth | null = null; // [SCOPE 094 / T002-T003]
  private state: LoadState = 'unloaded';
  private errorMsg = '';
  private signature = '';

  // [SCOPE 058 / T013] claimSink receives each fresh summary to drive scope
  // decorations + the FR-008 editor read-only.
  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly claimSink?: (summary: CockpitSummary | null) => void,
  ) {}

  // Hard refresh: drop cached data and show the load path again. Used by the
  // manual command, the sign-in flow, and the kit's emitted refresh URI.
  refresh(): void {
    this.summary = null;
    this.state = 'unloaded';
    this.signature = '';
    this.videosLoaded = false; // [SCOPE 042 / Videos] + [SCOPE 066] — re-fetch catalogs on refresh
    this._onDidChangeTreeData.fire();
  }

  // [SCOPE 042 / T020] BEGIN — poll (fallback re-query; fires only on real change)
  // The emitted-command URI (T021) is the primary, immediate signal. This poll
  // is the FR-006 fallback for work changed outside this IDE. It re-queries in
  // the background and only repaints when the content signature changed, so a
  // visible-but-unchanged view never flickers.
  async poll(): Promise<void> {
    const next = await this.computeState();
    if (next.signature === this.signature && next.state === this.state) return;
    this.applyState(next);
    this._onDidChangeTreeData.fire();
  }
  // [SCOPE 042 / T020] END

  getTreeItem(element: CockpitNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: CockpitNode): Promise<CockpitNode[]> {
    if (element) {
      if (element.kind === 'scope' && element.scope) {
        return element.scope.tasks.map((t) => taskNode(t, element.scope!));
      }
      // [SCOPE 043 / T010] expand the My Feedback group into item nodes.
      if (element.kind === 'feedback-group') {
        return this.feedback.map((f) => feedbackItemNode(f));
      }
      // [SCOPE 043 amendment] expand the incoming-from-customers group.
      if (element.kind === 'incoming-group') {
        return this.incoming.map((f) => feedbackItemNode(f));
      }
      // [SCOPE 042 / Help] expand the Help group into Standard/Extended categories.
      if (element.kind === 'help-group') {
        // [SCOPE 093 / T006] lead with the batch-commands cache tip, so the guidance
        // sits right where the workflow commands are launched.
        const cats: CockpitNode[] = [cacheTipNode()];
        if (this.helpCatalog.standard.length > 0) cats.push(helpCategoryNode('Standard', this.helpCatalog.standard));
        if (this.helpCatalog.extended.length > 0) cats.push(helpCategoryNode('Extended', this.helpCatalog.extended));
        return cats;
      }
      // [SCOPE 042 / Help] expand a category into command items.
      if (element.kind === 'help-category') {
        return (element.helpItems ?? []).map(helpItemNode);
      }
      // [SCOPE 042 / Help] expand a command into its optional parameters.
      if (element.kind === 'help-item') {
        return (element.helpCommand?.params ?? []).map(helpParamNode);
      }
      // [SCOPE 042 / Videos] expand the Videos group into the docs how-to videos,
      // then (SCOPE-066 FR-011) Open / Training marketing-video subtrees.
      if (element.kind === 'videos-group') {
        // [SCOPE 139 / T012] wxKanban's process videos as their own Onboarding group.
        const { onboarding, other } = splitOnboarding(this.videos);
        const children = other.map(videoItemNode);
        if (onboarding.length > 0) children.unshift(videoCategoryNode('Onboarding', onboarding));
        if (this.marketingVideos.open.length > 0) children.push(videoCategoryNode('Open', this.marketingVideos.open));
        if (this.marketingVideos.training.length > 0) children.push(videoCategoryNode('Training', this.marketingVideos.training));
        return children;
      }
      // [SCOPE 066 / T008] expand an Open/Training subtree into its videos.
      if (element.kind === 'video-category') {
        return (element.videoItems ?? []).map(videoItemNode);
      }
      // [SCOPE 066 / T008] expand the FAQ group into per-question items.
      if (element.kind === 'faq-group') {
        return this.faqs.map(faqItemNode);
      }
      // [SCOPE 066 / Guides] expand the Conversion Guides group into one row per
      // guide, and a guide into the languages it has been published in.
      if (element.kind === 'guides-group') {
        return this.guides.map(guideItemNode);
      }
      if (element.kind === 'guide-item') {
        return (element.guide?.variants ?? []).map(guideVariantNode);
      }
      // [SCOPE 081 / T005] expand the Development Plan group into checklist items.
      if (element.kind === 'devplan-group') {
        return (element.devplanItems ?? []).map(devplanItemNode);
      }
      // [SCOPE 091 / T005] expand the "Scopes unfinished" header into the scope rows
      // (active-scope first) — the same nodes that used to render flat at the root.
      if (element.kind === 'scopes-group') {
        const viewer = this.summary?.viewerUserId ?? null;
        return this.sortedWorkScopes().map((s) => scopeNode(s, s.specNumber === this.activeScope, viewer));
      }
      // [SCOPE 091 / T002] expand the Git group into unpushed commit subjects
      // (newest first, capped at 10 with a "…and N more" leaf).
      if (element.kind === 'git-group') {
        return gitCommitNodes(this.gitStatus?.subjects ?? []);
      }
      // [SCOPE 094 / T002-T003] expand the health header into the
      // per-check rows (orchestrator link, MCP connection, database).
      if (element.kind === 'health-group') {
        return this.health ? healthItemNodes(this.health) : [];
      }
      // [SCOPE 140 / T012] expand the morning summary card into its rows.
      if (element.kind === 'nightly-group') {
        return (element.nightlyRows ?? []).map(nightlyItemNode);
      }
      return [];
    }
    if (this.state === 'unloaded') {
      this.applyState(await this.computeState());
    }
    // [SCOPE 042 / Help] catalog is local-file based — load it independently of
    // the MCP load path so Help works in every state (incl. offline / no token).
    this.helpCatalog = loadCommandCatalog();
    // [SCOPE 042 / Videos] the docs index is public — load it independently of
    // the MCP load path (works without a token), best-effort and cached.
    if (!this.videosLoaded) {
      // [SCOPE 042 / Videos] + [SCOPE 066 / T008] — public catalogs, loaded together,
      // independent of the MCP path (work without a token), best-effort and cached.
      const [vids, mvids, faqs, guides] = await Promise.all([
        loadVideoCatalog(),
        loadMarketingVideoCatalog(),
        loadFaqCatalog(vscode.env.language), // [SCOPE 066 / T008] developer's editor language
        loadGuideCatalog(), // [SCOPE 066 / Guides] every language, not just the editor's
      ]);
      this.videos = vids;
      this.marketingVideos = mvids;
      this.faqs = faqs;
      this.guides = guides;
      this.videosLoaded = true;
    }
    // [SCOPE 060 / Cockpit] cheap local-fs check: are the kit's slash commands
    // installed into .claude/commands so Claude Code sees them? Independent of
    // the MCP load path (works offline / no token).
    this.commandsStatus = checkCommands();
    // [SCOPE 019 / R15] cheap local-fs read of the kit's cached version check.
    this.kitUpdate = checkKitUpdate();
    return this.withHealthSection(this.withNightlySection(this.withKitUpdateSection(this.withGitSection(this.withFaqSection(this.withDevplanSection(this.withGuidesSection(this.withVideosSection(this.withHelpSection(this.withManualSection(this.withCommunityHelpSection(this.withCommandsSection(this.rootNodes()))))))))))));
  }

  private applyState(s: ComputedState): void {
    this.state = s.state;
    this.summary = s.summary;
    this.activeScope = s.activeScope;
    this.feedback = s.feedback;
    this.incoming = s.incoming;
    this.gitStatus = s.gitStatus; // [SCOPE 091 / T002]
    this.health = s.health; // [SCOPE 094 / T002-T003]
    this.errorMsg = s.errorMsg;
    this.signature = s.signature;
    // [SCOPE 058 / T013] push claim state to the decoration + read-only provider.
    this.claimSink?.(s.summary);
  }

  // Resolve project + token + MCP read into a self-contained state snapshot.
  // Pure of side effects on `this` so both the load path and poll can use it.
  private async computeState(): Promise<ComputedState> {
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    // [SCOPE 091 / T003] cheap local git read, folded into every signature so
    // poll() repaints when the unpushed count changes (after a commit or push).
    const gitStatus = checkGitStatus();
    const gitSig = `git:${gitStatus.aheadCount}`;
    // [SCOPE 094 / T002-T003] token-free orchestrator/MCP probe. Runs
    // in every load state (it uses the auth-exempt /health) and is folded into the
    // signature so poll() repaints the moment connectivity flips.
    const health = await checkSystemHealth(folders);
    const healthSig = `health:${health.overall}:${health.mcp.version ?? ''}:${health.mcp.dbConnected ?? ''}`;
    const ctx = resolveProjectContext(folders);
    if (!ctx) {
      return { state: 'no-project', summary: null, activeScope: undefined, feedback: [], incoming: [], gitStatus, health, errorMsg: '', signature: `no-project|${gitSig}|${healthSig}` };
    }

    let token: string | null = null;
    try {
      token = await resolveToken(this.secrets, ctx.projectRoot, ctx.projectId);
    } catch {
      token = null;
    }
    if (!token) {
      return { state: 'no-token', summary: null, activeScope: ctx.activeScope, feedback: [], incoming: [], gitStatus, health, errorMsg: '', signature: `no-token|${gitSig}|${healthSig}` };
    }

    try {
      const client = new CockpitMcpClient({ baseUrl: ctx.mcpBaseUrl, token });
      const summary = await client.cockpitSummary(ctx.projectId);
      // [SCOPE 043 / T010] feedback is a secondary surface — never let it fail
      // the cockpit's primary remaining-work view.
      let feedback: MyFeedbackItem[] = [];
      try {
        feedback = await client.listMyFeedback(ctx.projectId);
      } catch {
        feedback = [];
      }
      // [SCOPE 043 amendment] The vendor's incoming queue. The server refuses this
      // unless the caller's company owns the sink, so for a customer it throws and
      // lands here as an empty list — same fail-quiet posture as the block above.
      // MODIFIED-BY: [SCOPE 043 / T024] — Amendment D (FR-022). Relying on the throw
      // was the defect: this refresh runs about twice a minute, so every consumer
      // project asked a vendor-only question ~2,880 times a day and was refused every
      // time (5,396 refusals across three projects on 2026-08-04). The fail-quiet
      // catch is why nobody noticed for two days. Ask only when the server says the
      // answer can be yes; the catch stays as the backstop, not the mechanism.
      //
      // Absent flag => ask anyway, preserving pre-Amendment-D behaviour against an
      // older server. Defaulting to "don't ask" would silently drop the vendor's
      // queue on any response that lost the field, and a silently missing surface is
      // the exact failure this scope exists to prevent. The cost of the fallback is
      // one refused read that FR-021 already made cheap and non-alarming.
      let incoming: MyFeedbackItem[] = [];
      if (summary.canViewIncoming !== false) {
        try {
          incoming = await client.listIncomingFeedback(ctx.projectId);
        } catch {
          incoming = [];
        }
      }
      const withWork = summary.scopes.filter((s) => s.remainingCount > 0);
      return {
        state: withWork.length === 0 ? 'empty' : 'ok',
        summary,
        activeScope: ctx.activeScope,
        feedback,
        incoming,
        gitStatus,
        health,
        errorMsg: '',
        signature: `${ctx.activeScope ?? ''}|${signatureOf(summary)}|${feedbackSignatureOf(feedback)}|${feedbackSignatureOf(incoming)}|${gitSig}|${healthSig}`,
      };
    } catch (err) {
      // Surface the resolved endpoint so a misconfig (e.g. falling back to
      // localhost when the hosted URL key is missing) is self-diagnosing.
      const msg = `Tried ${ctx.mcpBaseUrl} — ${(err as Error).message}`;
      return { state: 'error', summary: null, activeScope: ctx.activeScope, feedback: [], incoming: [], gitStatus, health, errorMsg: msg, signature: `error:${msg}|${gitSig}|${healthSig}` };
    }
  }

  private rootNodes(): CockpitNode[] {
    switch (this.state) {
      case 'no-project':
        return [messageNode('No wxKanban project linked', 'link', 'Open a folder with a .wxkanban-project.json, then refresh.', 'wxkanban.cockpit.signIn')];
      case 'no-token':
        return [messageNode('Sign in to wxKanban', 'key', 'No API token found — click to enter one.', 'wxkanban.cockpit.signIn')];
      case 'error':
        return [messageNode('Cannot reach wxKanban — click to retry', 'error', this.errorMsg, 'wxkanban.cockpit.refresh')];
      case 'empty':
        return this.withFeedbackSection([
          messageNode('All caught up — no remaining work', 'check', 'No incomplete tasks in this project.'),
        ]);
      case 'ok': {
        // [SCOPE 091 / T005] group the unfinished scopes under one collapsible
        // "<nn> Scopes unfinished" header instead of rendering them flat. The
        // rows themselves (and their active-first order) are produced on expand
        // by getChildren via sortedWorkScopes().
        const count = this.sortedWorkScopes().length;
        return this.withFeedbackSection([scopesGroupNode(count)]);
      }
      default:
        return [];
    }
  }

  // [SCOPE 091 / T005] Unfinished scopes (remaining work > 0), active scope first,
  // then by spec number. Shared by rootNodes() (count) and getChildren() (rows).
  private sortedWorkScopes(): CockpitScope[] {
    const withWork = (this.summary?.scopes ?? []).filter((s) => s.remainingCount > 0);
    return [...withWork].sort((a, b) => {
      const aActive = a.specNumber === this.activeScope ? 0 : 1;
      const bActive = b.specNumber === this.activeScope ? 0 : 1;
      return aActive - bActive || a.specNumber.localeCompare(b.specNumber);
    });
  }

  // [SCOPE 043 / T010] BEGIN — append the "My Feedback" group when the user has
  // submitted any. Collapsed by default, but auto-expanded (and badged) when an
  // item needs info, so the submitter notices without running a command.
  private withFeedbackSection(base: CockpitNode[]): CockpitNode[] {
    const withMine = this.feedback.length === 0 ? base : [...base, feedbackGroupNode(this.feedback)];
    // [SCOPE 043 amendment] The incoming queue is a SEPARATE section on purpose.
    // Folding customer reports into "My Feedback" is what made that list unusable:
    // 94 rows across 17 projects, of which 16 were actually this project's. Two
    // lists answering two questions beats one list answering neither.
    if (this.incoming.length === 0) return withMine;
    return [...withMine, incomingGroupNode(this.incoming)];
  }
  // [SCOPE 043 / T010] END

  // [SCOPE 042 / Help] BEGIN — append the "Help — Commands" section in every
  // state. Omitted only when no _wxAI/commands directory was found.
  private withHelpSection(base: CockpitNode[]): CockpitNode[] {
    if (this.helpCatalog.standard.length === 0 && this.helpCatalog.extended.length === 0) return base;
    return [...base, helpGroupNode()];
  }
  // [SCOPE 042 / Help] END

  // [SCOPE 060 / Cockpit] BEGIN — append a "slash commands not installed" prompt
  // when _wxAI/commands/ hasn't been copied into .claude/commands/ (so / commands
  // work in Claude Code). Shown only when an install would change something —
  // clicking it runs the install. Silent when everything's current.
  private withCommandsSection(base: CockpitNode[]): CockpitNode[] {
    const s = this.commandsStatus;
    if (!s || !s.root || !s.actionNeeded) return base;
    return [commandsSetupNode(s), ...base];
  }
  // [SCOPE 060 / Cockpit] END

  // [SCOPE 019 / R15] BEGIN — prepend a "Kit update available → Install" row when
  // the kit's cached version check found a newer release (and this isn't the
  // author repo). Clicking it runs the from-server upgrade in a terminal. Silent
  // when up to date, in the source repo, or the check hasn't run yet.
  private withKitUpdateSection(base: CockpitNode[]): CockpitNode[] {
    // [SCOPE 083 / T006] Amendment A widens this from one row to three. The
    // install state is authoritative: it also covers "no kit here at all" (which
    // the cache-only check could never see) and "update held back by a guard"
    // (so a blocked auto-start is always visible, never a silent skip).
    const state = resolveKitInstallState();
    if (state.kind === 'no-kit') return [kitInstallNode(), ...base];
    if (state.kind === 'blocked') return [kitBlockedNode(state.reason), ...base];
    // [SCOPE 083 / T010] A check that could not run gets its own
    // row. Previously it fell through to `base` — indistinguishable from being
    // up to date, which is precisely the silence the field report was about.
    if (state.kind === 'check-failed') return [kitCheckFailedNode(state.reason), ...base];

    const s = this.kitUpdate;
    if (!s || !s.root || !s.updateAvailable) return base;
    return [kitUpdateNode(s), ...base];
  }
  // [SCOPE 019 / R15] END

  // [SCOPE 140 / T012] BEGIN — prepend the nightly run's morning summary card when a run has
  // written one in this project (.wxai/nightly/last-summary.json). Read-only.
  private withNightlySection(base: CockpitNode[]): CockpitNode[] {
    for (const f of (vscode.workspace.workspaceFolders ?? []).map((w) => w.uri.fsPath)) {
      const card = loadNightlyCard(f);
      if (card) return [nightlyGroupNode(card), ...base];
    }
    return base;
  }
  // [SCOPE 140 / T012] END

  // [SCOPE 094 / T002-T003] BEGIN — prepend a "System Health" group at
  // the very top so a broken orchestrator/MCP connection is the first thing the
  // developer sees on open. Skipped only when no project is linked (the root
  // "No wxKanban project linked" message already covers that). When healthy it's a
  // low-key collapsed "OK" row; when degraded/offline it's an expanded warning.
  private withHealthSection(base: CockpitNode[]): CockpitNode[] {
    const h = this.health;
    if (!h || h.overall === 'unlinked') return base;
    return [healthGroupNode(h), ...base];
  }
  // [SCOPE 094 / T002-T003] END

  // [SCOPE 091 / T002] BEGIN — prepend a collapsible "Git — N commits to push"
  // group when the branch is ahead of its upstream. Read-only: it names the
  // unpushed commits and, in the tooltip, that they deploy only after a push to
  // main. Omitted entirely at 0 unpushed / non-git / no-upstream workspaces.
  private withGitSection(base: CockpitNode[]): CockpitNode[] {
    const s = this.gitStatus;
    if (!s || !s.root || s.aheadCount <= 0) return base;
    return [gitGroupNode(s.aheadCount), ...base];
  }
  // [SCOPE 091 / T002] END

  // [SCOPE 042 / Videos] BEGIN — append the "Help — Videos" section when the docs
  // index has at least one video. Omitted entirely when offline / none found.
  private withVideosSection(base: CockpitNode[]): CockpitNode[] {
    const total = this.videos.length + this.marketingVideos.open.length + this.marketingVideos.training.length;
    if (total === 0) return base;
    return [...base, videosGroupNode(total)];
  }
  // [SCOPE 042 / Videos] END

  // [SCOPE 066 / T008] BEGIN — append the "FAQ" section when any published FAQ
  // exists. Read-only; omitted entirely when offline / none found.
  private withFaqSection(base: CockpitNode[]): CockpitNode[] {
    if (this.faqs.length === 0) return base;
    return [...base, faqGroupNode(this.faqs.length)];
  }
  // [SCOPE 066 / T008] END

  // [SCOPE 066 / Guides] BEGIN — append the "Help — Conversion Guides" section
  // when the public guide index has at least one published guide. Read-only;
  // omitted entirely when offline / none found.
  private withGuidesSection(base: CockpitNode[]): CockpitNode[] {
    if (this.guides.length === 0) return base;
    return [...base, guidesGroupNode(this.guides)];
  }
  // [SCOPE 066 / Guides] END

  // [SCOPE 081 / T005] BEGIN — append the "Development Plan" section (deterministic
  // build-roadmap checklist) when the cockpit_summary carries devplan rows. Read-only.
  private withDevplanSection(base: CockpitNode[]): CockpitNode[] {
    const items = this.summary?.devplan ?? [];
    if (items.length === 0) return base;
    return [...base, devplanGroupNode(items)];
  }
  // [SCOPE 081 / T005] END

  // [SCOPE 079 / T05] BEGIN — always-available "Community Help" row → opens the
  // live wxKanban Community chat. Shown in every state so help is one click away.
  private withCommunityHelpSection(base: CockpitNode[]): CockpitNode[] {
    return [...base, communityHelpNode()];
  }
  // [SCOPE 079 / T05] END

  // [SCOPE 141 / T027] BEGIN — always-available "Manual" row (FR-017), in every state
  private withManualSection(base: CockpitNode[]): CockpitNode[] {
    return [...base, manualNode()];
  }
  // [SCOPE 141 / T027] END
}
// [SCOPE 042 / T016] END

// [SCOPE 042 / T016] BEGIN — node factories
function scopeNode(scope: CockpitScope, isActive: boolean, viewerUserId: string | null): CockpitNode {
  const node = new CockpitNode('scope', `#${scope.specNumber}  ${scope.title}`, vscode.TreeItemCollapsibleState.Collapsed, scope);
  // [SCOPE 058 / T013] claim state: a synthetic resourceUri lets ScopeClaimProvider
  // color/badge the row; the holder also shows inline + in the tooltip + context value
  // (so the right-click menu offers Check out vs Check in).
  const claim = scope.claimedBy ?? null;
  const byMe = !!claim && !!viewerUserId && claim.userId === viewerUserId;
  node.resourceUri = scopeResourceUri(scope.specNumber);
  node.description = claim ? `${scope.remainingCount} left · ${byMe ? 'you' : claim.name}` : `${scope.remainingCount} left`;
  node.tooltip =
    `Scope ${scope.specNumber} — ${scope.title}\nstatus: ${scope.status}` +
    (isActive ? '\n(active scope)' : '') +
    (claim ? `\nchecked out by ${byMe ? 'you' : claim.name}` : '');
  node.iconPath = new vscode.ThemeIcon(isActive ? 'star-full' : 'layers');
  node.contextValue = claim ? (byMe ? 'wxkanban.scope.mine' : 'wxkanban.scope.held') : 'wxkanban.scope.free';
  return node;
}

function taskNode(task: CockpitTask, scope: CockpitScope): CockpitNode {
  const node = new CockpitNode('task', task.title, vscode.TreeItemCollapsibleState.None, scope, task);
  node.description = task.status;
  node.iconPath = statusIcon(task.status);
  node.contextValue = 'wxkanban.task';
  node.command = {
    command: 'wxkanban.cockpit.openDetail',
    title: 'Open Detail',
    arguments: [{ task, scope }],
  };
  return node;
}

// [SCOPE 060 / Cockpit] "slash commands not installed" prompt — click to install.
function commandsSetupNode(s: CommandsStatus): CockpitNode {
  const missing = s.missing.length;
  const stale = s.stale.length;
  const label = missing > 0 ? 'Install wxKanban slash commands' : 'Update wxKanban slash commands';
  const node = new CockpitNode('commands-setup', label, vscode.TreeItemCollapsibleState.None);
  node.description = missing > 0 ? `${missing} not installed — click to install` : `${stale} outdated — click to update`;
  node.iconPath = new vscode.ThemeIcon('cloud-download', new vscode.ThemeColor('notificationsWarningIcon.foreground'));
  node.tooltip =
    `Copy the kit's commands from _wxAI/commands/ into .claude/commands/ so they work as / commands in Claude Code.` +
    (s.standardMissing.length ? `\nStandard commands missing: ${s.standardMissing.join(', ')}` : '') +
    `\nTarget: ${s.targetDir}`;
  node.contextValue = 'wxkanban.commandsSetup';
  node.command = { command: 'wxkanban.cockpit.installCommands', title: 'Install slash commands' };
  return node;
}

// [SCOPE 019 / R15] "Kit update available" prompt — click to run the upgrade.
function kitUpdateNode(s: KitUpdateStatus): CockpitNode {
  const from = s.currentVersion ?? '?';
  const to = s.latestVersion ?? 'latest';
  const node = new CockpitNode('kit-update', 'Kit update available — Install', vscode.TreeItemCollapsibleState.None);
  node.description = `${from} → ${to} · click to install`;
  node.iconPath = new vscode.ThemeIcon('cloud-download', new vscode.ThemeColor('notificationsWarningIcon.foreground'));
  node.tooltip =
    `A newer wxKanban kit is available (${from} → ${to}).\n` +
    `Click to download and apply it (you'll confirm in the terminal).` +
    (s.releaseUrl ? `\nRelease notes: ${s.releaseUrl}` : '');
  node.contextValue = 'wxkanban.kitUpdate';
  node.command = { command: 'wxkanban.cockpit.upgradeKit', title: 'Install kit update' };
  return node;
}

// [SCOPE 083 / T008] BEGIN — "No kit installed" row for a kit-less folder.
// Bootstrapping unpacks an archive over the folder, so this is always offered
// and never started on its own.
function kitInstallNode(): CockpitNode {
  const node = new CockpitNode('kit-install', 'No kit installed — Install', vscode.TreeItemCollapsibleState.None);
  node.description = 'set up this folder';
  node.iconPath = new vscode.ThemeIcon('cloud-download', new vscode.ThemeColor('notificationsWarningIcon.foreground'));
  node.tooltip =
    'This folder has no wxKanban kit.\n' +
    'Click to connect it to a project, download the kit, and run the setup.';
  node.contextValue = 'wxkanban.kitInstall';
  node.command = { command: 'wxkanban.cockpit.installKit', title: 'Install kit' };
  return node;
}
// [SCOPE 083 / T008] END

// [SCOPE 083 / T009] BEGIN — a held-back update stays visible and clickable.
// A guard must never look like "nothing to do": it says what stopped it, and
// the manual apply remains one click away.
function kitBlockedNode(reason: string): CockpitNode {
  const node = new CockpitNode('kit-blocked', 'Kit update waiting — Install', vscode.TreeItemCollapsibleState.None);
  node.description = `held back: ${reason}`;
  node.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('notificationsWarningIcon.foreground'));
  node.tooltip =
    `A kit update is available but was not started automatically because there are ${reason}.\n` +
    'The upgrade overwrites files in this folder, so commit or stash first.\n' +
    'Click to run it anyway — you still confirm in the terminal.';
  node.contextValue = 'wxkanban.kitBlocked';
  node.command = { command: 'wxkanban.cockpit.upgradeKit', title: 'Install kit update' };
  return node;
}
// [SCOPE 083 / T009] END

// [SCOPE 083 / T010] BEGIN — the check could not run.
// Deliberately NOT an "update available" row: we do not know whether one exists.
// It states the gap and names the reason, because the failure mode this closes
// is an operator trusting a negative that was never measured.
function kitCheckFailedNode(reason: string): CockpitNode {
  const node = new CockpitNode('kit-check-failed', 'Kit update check failed', vscode.TreeItemCollapsibleState.None);
  node.description = reason;
  node.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('notificationsWarningIcon.foreground'));
  node.tooltip =
    `The kit could not check for a newer release: ${reason}.\n` +
    'This is NOT the same as being up to date — the version is unknown.\n' +
    'Click to run the check by hand in a terminal.';
  node.contextValue = 'wxkanban.kitCheckFailed';
  node.command = { command: 'wxkanban.cockpit.recheckKit', title: 'Re-run the kit version check' };
  return node;
}
// [SCOPE 083 / T010] END

// [SCOPE 091 / T005] Collapsible header the unfinished scope rows hang under.
// Collapsed by default; expands (via getChildren) into the same scope nodes.
function scopesGroupNode(count: number): CockpitNode {
  const node = new CockpitNode('scopes-group', `${count} Scope${count === 1 ? '' : 's'} unfinished`, vscode.TreeItemCollapsibleState.Collapsed);
  node.description = 'remaining work';
  node.iconPath = new vscode.ThemeIcon('list-tree');
  node.tooltip = `${count} scope${count === 1 ? '' : 's'} with remaining work — expand to see each.`;
  node.contextValue = 'wxkanban.scopesGroup';
  return node;
}

// [SCOPE 091 / T002] BEGIN — Git group + unpushed-commit leaves.
// MODIFIED-BY: [SCOPE 141 / T027] — customer-neutral wording: the tooltip named wxKanban's own hosting
// Read-only: the group counts unpushed commits and warns (in the tooltip) that
// they reach the remote only after a push; expanding lists their subjects.
function gitGroupNode(count: number): CockpitNode {
  const node = new CockpitNode('git-group', `Git — ${count} commit${count === 1 ? '' : 's'} to push`, vscode.TreeItemCollapsibleState.Collapsed);
  node.description = 'not yet pushed';
  node.iconPath = new vscode.ThemeIcon('cloud-upload', new vscode.ThemeColor('notificationsWarningIcon.foreground'));
  node.tooltip =
    `${count} local commit${count === 1 ? '' : 's'} ahead of origin.\n` +
    `Nobody else sees them, and nothing that deploys on push runs, until you push.`;
  node.contextValue = 'wxkanban.gitGroup';
  return node;
}

function gitCommitNodes(subjects: string[]): CockpitNode[] {
  const CAP = 10;
  const nodes = subjects.slice(0, CAP).map(gitCommitNode);
  const more = subjects.length - CAP;
  if (more > 0) {
    const moreNode = new CockpitNode('git-commit', `…and ${more} more`, vscode.TreeItemCollapsibleState.None);
    moreNode.iconPath = new vscode.ThemeIcon('ellipsis');
    moreNode.tooltip = `${more} more unpushed commit${more === 1 ? '' : 's'} not shown`;
    nodes.push(moreNode);
  }
  return nodes;
}

function gitCommitNode(subject: string): CockpitNode {
  const node = new CockpitNode('git-commit', subject, vscode.TreeItemCollapsibleState.None);
  node.iconPath = new vscode.ThemeIcon('git-commit');
  node.tooltip = subject;
  node.contextValue = 'wxkanban.gitCommit';
  return node;
}
// [SCOPE 091 / T002] END

// [SCOPE 094 / T002-T003] BEGIN — System Health group + per-check rows.
// The header rolls up orchestrator link + MCP reachability + DB into one verdict;
// expanding shows each individual check. Healthy → collapsed & quiet; degraded or
// offline → expanded & coloured so it can't be missed on open.
function healthGroupNode(h: SystemHealth): CockpitNode {
  const healthy = h.overall === 'ok';
  const node = new CockpitNode(
    'health-group',
    healthy ? 'System Health — OK' : h.overall === 'degraded' ? 'System Health — degraded' : 'System Health — offline',
    healthy ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded,
  );
  node.description = healthy ? (h.mcp.version ? `MCP v${h.mcp.version}` : 'connected') : 'action needed';
  node.iconPath = healthy
    ? new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'))
    : new vscode.ThemeIcon(
        h.overall === 'offline' ? 'cloud' : 'warning',
        new vscode.ThemeColor(h.overall === 'offline' ? 'notificationsErrorIcon.foreground' : 'notificationsWarningIcon.foreground'),
      );
  node.tooltip = healthy
    ? `Orchestrator linked and reachable at ${h.mcp.endpoint}.`
    : h.overall === 'offline'
      ? `Cannot reach the wxKanban orchestrator/MCP at ${h.mcp.endpoint} (${h.mcp.error}). ` +
        `Kit commands and the Cockpit can't sync until it's reachable — check your network or the mcpBaseUrl in .wxkanban-project.json.`
      : `Reached ${h.mcp.endpoint} but the hub reports its database is down — writes will fail until it recovers.`;
  node.contextValue = 'wxkanban.healthGroup';
  return node;
}

function healthItemNodes(h: SystemHealth): CockpitNode[] {
  const rows: CockpitNode[] = [];
  // Orchestrator link — a valid .wxkanban-project.json resolved.
  rows.push(healthItemNode('Orchestrator', h.linked ? 'linked' : 'not linked', h.linked, 'plug'));
  // MCP connection — the /health probe.
  rows.push(
    healthItemNode(
      'MCP connection',
      h.mcp.reachable ? `reachable${h.mcp.version ? ` · v${h.mcp.version}` : ''}` : `unreachable — ${h.mcp.error}`,
      h.mcp.reachable,
      'radio-tower',
      h.mcp.endpoint,
    ),
  );
  // Database — the hub's self-reported connectivity (null when unreachable).
  if (h.mcp.reachable) {
    const db = h.mcp.dbConnected;
    rows.push(healthItemNode('Database', db === true ? 'connected' : db === false ? 'down' : 'unknown', db !== false, 'database'));
  }
  return rows;
}

function healthItemNode(label: string, value: string, ok: boolean, icon: string, tooltip?: string): CockpitNode {
  const node = new CockpitNode('health-item', label, vscode.TreeItemCollapsibleState.None);
  node.description = value;
  node.iconPath = new vscode.ThemeIcon(
    ok ? icon : 'error',
    ok ? undefined : new vscode.ThemeColor('notificationsErrorIcon.foreground'),
  );
  node.tooltip = tooltip ? `${label}: ${value}\n${tooltip}` : `${label}: ${value}`;
  node.contextValue = 'wxkanban.healthItem';
  return node;
}
// [SCOPE 094 / T002-T003] END

// [SCOPE 140 / T012] BEGIN — the morning summary card and its rows
function nightlyGroupNode(card: NightlyCard): CockpitNode {
  const node = new CockpitNode('nightly-group', card.title, card.tone === 'ok' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
  node.nightlyRows = card.rows;
  node.description = card.finishedAt ? new Date(card.finishedAt).toLocaleString() : undefined;
  node.iconPath = new vscode.ThemeIcon(
    card.tone === 'ok' ? 'pass-filled' : card.tone === 'warn' ? 'warning' : 'error',
    new vscode.ThemeColor(card.tone === 'ok' ? 'testing.iconPassed' : card.tone === 'warn' ? 'notificationsWarningIcon.foreground' : 'testing.iconFailed'),
  );
  node.tooltip = 'Last nightly test run (wxPreTest --nightly). Click to open the full morning summary.';
  if (card.summaryPath) node.command = { command: 'vscode.open', title: 'Open the morning summary', arguments: [vscode.Uri.file(card.summaryPath)] };
  node.contextValue = 'wxkanban.nightlyGroup';
  return node;
}

function nightlyItemNode(row: NightlyRow): CockpitNode {
  const node = new CockpitNode('nightly-item', row.label, vscode.TreeItemCollapsibleState.None);
  node.description = row.detail;
  node.tooltip = `${row.label}: ${row.detail}`;
  const icon = { ok: 'check', warn: 'warning', error: 'error', info: 'info' }[row.tone];
  node.iconPath = new vscode.ThemeIcon(icon);
  node.contextValue = 'wxkanban.nightlyItem';
  return node;
}
// [SCOPE 140 / T012] END

// [SCOPE 081 / T005] BEGIN — Development Plan group + checklist items.
function devplanGroupNode(items: NonNullable<CockpitSummary['devplan']>): CockpitNode {
  const done = items.filter((i) => i.state === 'done').length;
  const node = new CockpitNode(
    'devplan-group',
    `Development Plan (${done}/${items.length})`,
    vscode.TreeItemCollapsibleState.Collapsed,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    items,
  );
  node.iconPath = new vscode.ThemeIcon('checklist');
  node.tooltip = 'Foundation-up build roadmap — done / in progress / not started per scope.';
  node.contextValue = 'wxkanban.devplan';
  return node;
}

function devplanItemNode(item: { scope: string; title: string; state: string }): CockpitNode {
  const mark = item.state === 'done' ? '✓' : item.state === 'partial' ? '◐' : '○';
  const node = new CockpitNode('devplan-item', `${mark} ${item.scope} — ${item.title}`, vscode.TreeItemCollapsibleState.None);
  node.description = item.state;
  node.iconPath = new vscode.ThemeIcon(
    item.state === 'done' ? 'pass-filled' : item.state === 'partial' ? 'circle-large-outline' : 'circle-outline',
  );
  return node;
}
// [SCOPE 081 / T005] END

// [SCOPE 079 / T05] "Community Help" action row — opens the live community chat panel.
function communityHelpNode(): CockpitNode {
  const node = new CockpitNode('community-help', 'Community Help — live chat', vscode.TreeItemCollapsibleState.None);
  node.description = 'ask the wxKanban Community';
  node.iconPath = new vscode.ThemeIcon('comment-discussion');
  node.tooltip = 'Open a live chat with the wxKanban Community for support and community help.';
  node.contextValue = 'wxkanban.communityHelp';
  node.command = { command: 'wxkanban.cockpit.openChat', title: 'Community Help' };
  return node;
}

// [SCOPE 141 / T027] BEGIN — "Manual" action row: opens the wxKanban Manual in the browser.
function manualNode(): CockpitNode {
  const node = new CockpitNode('manual', 'Manual — wxKanban, the Cockpit and every command', vscode.TreeItemCollapsibleState.None);
  node.description = 'opens in your browser';
  node.iconPath = new vscode.ThemeIcon('book');
  node.tooltip = 'Open the wxKanban Manual: getting started, the scope-to-release process, the web app, this Cockpit, and a reference for every command.';
  node.contextValue = 'wxkanban.manual';
  node.command = { command: 'wxkanban.cockpit.openManual', title: 'Open the Manual' };
  return node;
}
// [SCOPE 141 / T027] END

function messageNode(label: string, icon: string, tooltip?: string, command?: string): CockpitNode {
  const node = new CockpitNode('message', label, vscode.TreeItemCollapsibleState.None);
  node.iconPath = new vscode.ThemeIcon(icon);
  if (tooltip) node.tooltip = tooltip;
  if (command) node.command = { command, title: label };
  return node;
}

function statusIcon(status: string): vscode.ThemeIcon {
  switch (status) {
    case 'in_progress':
      return new vscode.ThemeIcon('sync');
    case 'blocked':
      return new vscode.ThemeIcon('error');
    default:
      return new vscode.ThemeIcon('circle-outline');
  }
}
// [SCOPE 042 / T016] END

// [SCOPE 043 / T010] BEGIN — feedback node factories
function feedbackGroupNode(items: MyFeedbackItem[]): CockpitNode {
  const needsInfo = items.filter((f) => f.status === 'needsinfo').length;
  // Auto-expand when something needs the user's attention.
  const node = new CockpitNode(
    'feedback-group',
    'My Feedback',
    needsInfo > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
  );
  node.description = needsInfo > 0 ? `${needsInfo} need info` : `${items.length}`;
  node.iconPath = new vscode.ThemeIcon(needsInfo > 0 ? 'warning' : 'comment-discussion');
  node.tooltip = `Your bug reports & suggestions${needsInfo > 0 ? ` — ${needsInfo} awaiting your reply` : ''}`;
  node.contextValue = 'wxkanban.feedbackGroup';
  return node;
}

// [SCOPE 043 amendment] BEGIN — "Incoming from customers": reports filed by other
// companies into a sink this company owns. Rendered only when non-empty, so it is
// invisible to every consumer project.
function incomingGroupNode(items: MyFeedbackItem[]): CockpitNode {
  const untriaged = items.filter((f) => f.status === 'new').length;
  const node = new CockpitNode(
    'incoming-group',
    'Incoming from customers',
    vscode.TreeItemCollapsibleState.Collapsed,
  );
  node.description = untriaged > 0 ? `${untriaged} new of ${items.length}` : `${items.length}`;
  node.iconPath = new vscode.ThemeIcon(untriaged > 0 ? 'inbox' : 'mail-read');
  node.tooltip = `Bug reports & suggestions your customers filed${untriaged > 0 ? ` — ${untriaged} not yet triaged` : ''}`;
  node.contextValue = 'wxkanban.incomingGroup';
  return node;
}
// [SCOPE 043 amendment] END

function feedbackItemNode(item: MyFeedbackItem): CockpitNode {
  const needsInfo = item.status === 'needsinfo';
  const node = new CockpitNode('feedback', item.title, vscode.TreeItemCollapsibleState.None, undefined, undefined, item);
  node.description = needsInfo ? 'needs info — click to reply' : `${item.status} — click to push to chat`;
  node.iconPath = feedbackStatusIcon(item);
  node.contextValue = 'wxkanban.feedback';
  const lines = [
    `${item.type} · ${item.status}${item.severity ? ` · ${item.severity}` : ''}`,
    `ref ${item.referenceId.slice(0, 8)}`,
  ];
  if (item.duplicateOfId) lines.push('already received (linked to an existing report)');
  if (needsInfo && item.clarificationQuestion) lines.push(`\nwxperts asked: ${item.clarificationQuestion}`);
  if (item.status === 'declined' && item.declineReason) lines.push(`\ndeclined: ${item.declineReason}`);
  node.tooltip = lines.join('\n');
  // Needs-info items open the single-round reply; every other item pushes its full
  // text into the Claude chat (it no longer changes the status — [SCOPE 043 / T034]).
  // The read-only detail view stays available via the item's right-click context menu.
  // [SCOPE 043 / T011, T011b]
  if (needsInfo) {
    node.command = {
      command: 'wxkanban.cockpit.answerFeedback',
      title: 'Answer',
      arguments: [item],
    };
  } else {
    node.command = {
      command: 'wxkanban.cockpit.pushFeedbackToChat',
      title: 'Push to Claude chat',
      arguments: [item],
    };
  }
  return node;
}

function feedbackStatusIcon(item: MyFeedbackItem): vscode.ThemeIcon {
  switch (item.status) {
    case 'needsinfo':
      return new vscode.ThemeIcon('question');
    case 'inprogress':
      return new vscode.ThemeIcon('sync');
    case 'resolved':
      return new vscode.ThemeIcon('pass');
    case 'declined':
      return new vscode.ThemeIcon('circle-slash');
    default:
      return new vscode.ThemeIcon(item.duplicateOfId ? 'copy' : 'comment');
  }
}
// [SCOPE 043 / T010] END

// [SCOPE 042 / Help] BEGIN — help node factories
function helpGroupNode(): CockpitNode {
  const node = new CockpitNode('help-group', 'Help — Commands', vscode.TreeItemCollapsibleState.Collapsed);
  node.iconPath = new vscode.ThemeIcon('book');
  // [SCOPE 093 / T006] hint the cache-batching guidance from the group tooltip too.
  node.tooltip = 'wxKanban kit commands — what each one does. Tip: run several in one sitting to ride the prompt cache.';
  node.contextValue = 'wxkanban.helpGroup';
  return node;
}

// [SCOPE 093 / T006] BEGIN — prompt-cache batching guidance shown at the top of the
// commands list. The editor AI re-pays a fixed context preamble on every COLD command
// run; grouping kit commands within Anthropic's ~5-minute prompt-cache window lets later
// runs reuse that prefix instead of re-billing it. Read-only info row, no command.
function cacheTipNode(): CockpitNode {
  const node = messageNode(
    'Tip: batch commands to ride the cache',
    'lightbulb',
    'Each cold command run re-pays the fixed context preamble (CLAUDE.md, rules, tool defs).\n' +
      'Anthropic caches that prefix for ~5 minutes — so running several kit commands together, ' +
      'rather than spread out, lets the later runs reuse the cached preamble instead of paying ' +
      'for it again. Batch your buildscope / createSpecs / implement steps in one sitting when you can.',
  );
  node.contextValue = 'wxkanban.cacheTip';
  return node;
}
// [SCOPE 093 / T006] END

function helpCategoryNode(label: string, items: HelpCommand[]): CockpitNode {
  const node = new CockpitNode(
    'help-category',
    label,
    vscode.TreeItemCollapsibleState.Collapsed,
    undefined,
    undefined,
    undefined,
    undefined,
    items,
  );
  node.description = `${items.length}`;
  node.iconPath = new vscode.ThemeIcon('list-unordered');
  node.tooltip = label === 'Standard' ? 'Core lifecycle commands' : 'Additional _wxAI commands';
  node.contextValue = 'wxkanban.helpCategory';
  return node;
}

function helpItemNode(cmd: HelpCommand): CockpitNode {
  // Commands with documented optional params expand into a param list; the rest
  // stay as leaves. Clicking the label still opens the full command help.
  const hasParams = cmd.params.length > 0;
  const node = new CockpitNode(
    'help-item',
    `/${cmd.name}`,
    hasParams ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    undefined,
    undefined,
    undefined,
    cmd,
  );
  node.description = cmd.blurb;
  node.tooltip = cmd.blurb || `/${cmd.name}`;
  node.iconPath = new vscode.ThemeIcon('terminal');
  node.contextValue = 'wxkanban.helpItem';
  node.command = {
    command: 'wxkanban.cockpit.openCommandHelp',
    title: 'Open command help',
    arguments: [cmd],
  };
  return node;
}

function helpParamNode(param: HelpParam): CockpitNode {
  const node = new CockpitNode('help-param', param.name, vscode.TreeItemCollapsibleState.None);
  node.description = param.blurb;
  node.tooltip = param.blurb ? `${param.name} (optional) — ${param.blurb}` : `${param.name} (optional)`;
  node.iconPath = new vscode.ThemeIcon('symbol-parameter');
  node.contextValue = 'wxkanban.helpParam';
  return node;
}
// [SCOPE 042 / Help] END

// [SCOPE 042 / Videos] BEGIN — video node factories
function videosGroupNode(count: number): CockpitNode {
  const node = new CockpitNode('videos-group', 'Help — Videos', vscode.TreeItemCollapsibleState.Collapsed);
  node.description = `${count}`;
  node.iconPath = new vscode.ThemeIcon('device-camera-video');
  node.tooltip = 'How-to videos from the wxKanban docs — click to watch in your browser';
  node.contextValue = 'wxkanban.videosGroup';
  return node;
}

function videoItemNode(v: DocVideo): CockpitNode {
  const node = new CockpitNode(
    'video-item',
    v.title,
    vscode.TreeItemCollapsibleState.None,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    v,
  );
  node.description = v.summary;
  node.tooltip = v.summary ? `${v.title} — ${v.summary}\n${v.pageUrl}` : v.pageUrl;
  node.iconPath = new vscode.ThemeIcon('play-circle');
  node.contextValue = 'wxkanban.video';
  node.command = {
    command: 'wxkanban.cockpit.openVideo',
    title: 'Watch video',
    arguments: [v],
  };
  return node;
}
// [SCOPE 042 / Videos] END

// [SCOPE 066 / T008] BEGIN — Open/Training video subtree + FAQ node factories
function videoCategoryNode(label: string, items: DocVideo[]): CockpitNode {
  const node = new CockpitNode(
    'video-category', label, vscode.TreeItemCollapsibleState.Collapsed,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, items,
  );
  node.description = `${items.length}`;
  node.iconPath = new vscode.ThemeIcon('folder');
  node.tooltip = `${label} marketing videos`;
  node.contextValue = 'wxkanban.videoCategory';
  return node;
}

function faqGroupNode(count: number): CockpitNode {
  const node = new CockpitNode('faq-group', 'FAQ', vscode.TreeItemCollapsibleState.Collapsed);
  node.description = `${count}`;
  node.iconPath = new vscode.ThemeIcon('question');
  node.tooltip = 'Frequently asked questions — click one to read the answer';
  node.contextValue = 'wxkanban.faqGroup';
  return node;
}

function faqItemNode(f: FaqEntry): CockpitNode {
  const node = new CockpitNode(
    'faq-item', f.question, vscode.TreeItemCollapsibleState.None,
    undefined, undefined, undefined, undefined, undefined, undefined, f,
  );
  node.iconPath = new vscode.ThemeIcon(f.videoUrl ? 'play-circle' : 'comment');
  node.tooltip = f.answer.length > 300 ? `${f.answer.slice(0, 299)}…` : f.answer;
  node.contextValue = 'wxkanban.faq';
  node.command = {
    command: 'wxkanban.cockpit.openFaq',
    title: 'Read answer',
    arguments: [f],
  };
  return node;
}
// [SCOPE 066 / T008] END

// [SCOPE 066 / Guides] BEGIN — conversion-guide node factories
function guidesGroupNode(guides: GuideEntry[]): CockpitNode {
  const files = guides.reduce((n, g) => n + g.variants.length, 0);
  const node = new CockpitNode('guides-group', 'Help — Conversion Guides', vscode.TreeItemCollapsibleState.Collapsed);
  // Both counts, because they answer different questions: how many guides there
  // are, and how many downloadable files that comes to across the languages.
  node.description = guides.length === files ? `${files}` : `${guides.length} · ${files} files`;
  node.iconPath = new vscode.ThemeIcon('book');
  node.tooltip = 'Downloadable WinDev/WebDev migration guides — expand a guide, then click a language to download the PDF';
  node.contextValue = 'wxkanban.guidesGroup';
  return node;
}

function guideItemNode(g: GuideEntry): CockpitNode {
  const node = new CockpitNode(
    'guide-item', g.title, vscode.TreeItemCollapsibleState.Collapsed,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, g,
  );
  node.description = g.variants.map((v) => v.language).join(' · ');
  node.iconPath = new vscode.ThemeIcon('book');
  node.tooltip = g.summary ? `${g.title}

${g.summary}` : g.title;
  node.contextValue = 'wxkanban.guide';
  return node;
}

function guideVariantNode(v: GuideVariant): CockpitNode {
  const node = new CockpitNode(
    'guide-variant', v.language, vscode.TreeItemCollapsibleState.None,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, v,
  );
  node.description = 'PDF';
  node.iconPath = new vscode.ThemeIcon('cloud-download');
  node.tooltip = `Download the ${v.language} PDF (${v.locale})
${v.fileUrl}`;
  node.contextValue = 'wxkanban.guideVariant';
  node.command = {
    command: 'wxkanban.cockpit.openGuide',
    title: 'Download guide',
    arguments: [v],
  };
  return node;
}
// [SCOPE 066 / Guides] END

// [SCOPE 042 / T020] BEGIN — signatureOf (stable fingerprint of the remaining-work payload)
// Captures everything the view renders — scope identity, remaining counts, and
// each task's id+status — so poll() can tell a real change from a no-op without
// repainting the tree on every tick.
function signatureOf(summary: CockpitSummary): string {
  return summary.scopes
    .map((s) => `${s.specNumber}:${s.remainingCount}:${s.tasks.map((t) => `${t.id}=${t.status}`).join(',')}`)
    .join('|');
}
// [SCOPE 042 / T020] END

// [SCOPE 043 / T010] BEGIN — feedbackSignatureOf (so poll repaints on status changes)
function feedbackSignatureOf(items: MyFeedbackItem[]): string {
  return items.map((f) => `${f.id}=${f.status}`).join(',');
}
// [SCOPE 043 / T010] END

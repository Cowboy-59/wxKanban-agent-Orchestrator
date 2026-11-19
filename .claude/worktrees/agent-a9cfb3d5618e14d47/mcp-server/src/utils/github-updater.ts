import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import logger from './logger.js';

// [SCOPE 083 / T012] BEGIN — report a measured version or none.
//
// This was `return '0.0.0'` behind a live TODO: it never read a version, and
// every caller of project.check_for_updates was handed a fabricated one (field
// report b54b281e). '0.0.0' is not "unknown" — it is a COMPARABLE value meaning
// "older than every release", so compareVersions('0.0.0', x) is always -1 and
// updateAvailable would always be true. The only thing holding it false was the
// companion defect below (the wrong, private repository 404ing). Fixing that URL
// on its own would have armed this. They are fixed together, deliberately.
const requireFromHere = createRequire(import.meta.url);

function getCurrentVersion(): string | null {
  // Ops already pin this to the deployed release for watermark provenance
  // (SCOPE-082, src/version.ts); it is the most authoritative answer we have.
  const pinned = process.env['WXKANBAN_VERSION'];
  if (pinned && pinned.trim()) return pinned.trim();

  // Otherwise read the MCP's own manifest at runtime — never a baked literal,
  // which is how a stale constant silently outlives the build it describes.
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const rel of ['../package.json', '../../package.json']) {
      const candidate = join(here, rel);
      if (!existsSync(candidate)) continue;
      const pkg = requireFromHere(candidate) as { name?: string; version?: string };
      if (pkg.version) return pkg.version;
    }
  } catch (error) {
    logger.warn('Could not resolve the installed MCP version', { error: (error as Error).message });
  }
  return null;
}

// The repository that actually publishes kit releases. It is NOT Cowboy-59/wxKanban:
// that repo is private, has no releases, and its 404 was being reported to callers
// as "Could not fetch latest release" — a misconfiguration wearing the costume of
// an empty result.
const RELEASES_REPO = 'Cowboy-59/wxKanban-agent-Orchestrator';

// Self-upgrade is OFF unless a local install opts in. installUpdate() rm -rf's
// inside MCP_SERVER_PATH, which on the hosted MCP is the shared server's own
// working directory, and project.upgrade_mcp is reachable by any caller holding
// the project-admin role. A destructive default that depends on correctly
// detecting every hosting environment is the wrong way round: refuse, and let a
// local install say so explicitly.
const SELF_UPGRADE_ENV = 'MCP_ALLOW_SELF_UPGRADE';

function selfUpgradeAllowed(): boolean {
  const v = process.env[SELF_UPGRADE_ENV];
  return typeof v === 'string' && (v === '1' || v.toLowerCase() === 'true');
}
// [SCOPE 083 / T012] END

// --- Type and constant definitions to resolve missing references ---
export interface ReleaseInfo {
  version: string;
  tagName: string;
  publishedAt: string;
  htmlUrl: string;
  tarballUrl: string;
  zipballUrl: string;
  body: string;
  prerelease: boolean;
  draft: boolean;
}

export interface UpdateStatus {
  /** [SCOPE 083 / T012] null when it could not be determined —
   *  never a placeholder, because a placeholder gets compared. */
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseInfo: ReleaseInfo | null;
  lastChecked: Date | null;
  error?: string;
}

const GITHUB_API_BASE = `https://api.github.com/repos/${RELEASES_REPO}`;
const MCP_SERVER_PATH = process.env.MCP_SERVER_PATH || process.cwd();
const LAST_CHECK_FILE = join(MCP_SERVER_PATH, '.last-update-check');
const UPDATE_CHECK_INTERVAL_HOURS = 24;

/**
 * Fetch latest release from GitHub API
 */
export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/releases/latest`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'mcp-project-hub-updater'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        logger.warn('No releases found in repository');
        return null;
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
      tag_name: string;
      published_at: string;
      html_url: string;
      tarball_url: string;
      zipball_url: string;
      body: string;
      prerelease: boolean;
      draft: boolean;
    };
    
    return {
      version: data.tag_name.replace(/^v/, ''), // Remove 'v' prefix if present
      tagName: data.tag_name,
      publishedAt: data.published_at,
      htmlUrl: data.html_url,
      tarballUrl: data.tarball_url,
      zipballUrl: data.zipball_url,
      body: data.body || '',
      prerelease: data.prerelease,
      draft: data.draft
    };

  } catch (error) {
    logger.error('Failed to fetch latest release', error as Error);
    return null;
  }
}

/**
 * Compare two semantic versions
 * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
// NOTE: no longer called by checkForUpdates — see the cross-stream guard there.
// Kept exported for a future same-stream check and for the tests that pin down
// why '0.0.0' was dangerous (it is the minimum of this ordering, not "unknown").
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;
    
    if (part1 < part2) return -1;
    if (part1 > part2) return 1;
  }
  
  return 0;
}

/**
 * Check if an update is available
 */
export async function checkForUpdates(force: boolean = false): Promise<UpdateStatus> {
  const currentVersion = getCurrentVersion();
  
  // [SCOPE 083 / T012] A throttled response is not a measurement.
  // Say so, rather than returning updateAvailable:false as though we had looked.
  if (!force && shouldSkipCheck()) {
    logger.info('Skipping update check - already checked recently');
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      releaseInfo: null,
      lastChecked: getLastCheckTime(),
      error: `No check performed: throttled to once per ${UPDATE_CHECK_INTERVAL_HOURS}h. Pass force:true to check now.`
    };
  }

  logger.info('Checking for MCP server updates...', { currentVersion });

  try {
    const release = await fetchLatestRelease();
    
    if (!release) {
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        releaseInfo: null,
        lastChecked: new Date(),
        error: `Could not fetch the latest release from ${RELEASES_REPO}. `
          + 'The version is UNKNOWN — this is not a report that you are up to date.'
      };
    }

    // Don't suggest draft or prerelease versions unless explicitly configured
    if (release.draft || release.prerelease) {
      logger.info('Latest release is draft/prerelease, skipping', {
        tagName: release.tagName,
        draft: release.draft,
        prerelease: release.prerelease
      });
      return {
        currentVersion,
        latestVersion: release.version,
        updateAvailable: false,
        releaseInfo: release,
        lastChecked: new Date()
      };
    }

    // [SCOPE 083 / T012] A comparison with an unknown side is not
    // a comparison. Report it as unmade rather than defaulting either way — the
    // old code defaulted to "you are behind" via the '0.0.0' placeholder, which
    // is the direction that triggers a destructive upgrade.
    if (!currentVersion) {
      return {
        currentVersion: null,
        latestVersion: release.version,
        updateAvailable: false,
        releaseInfo: release,
        lastChecked: new Date(),
        error: 'Could not determine the installed version, so no comparison was made. '
          + `The latest published release is ${release.version}.`
      };
    }

    // [SCOPE 083 / T012] Do not compare across release streams.
    //
    // The releases in RELEASES_REPO are ORCHESTRATOR KIT releases (v1.7.62 and
    // up). The MCP server carries its own, unrelated version (0.1.1) and has no
    // independent release stream — it is deployed by its own pipeline on push.
    // Comparing them is not a version check, it is a category error, and it
    // lands on "behind" every single time. That is the same false positive the
    // '0.0.0' placeholder produced, reached by a different road, so correcting
    // the repository URL without this guard would simply re-arm it.
    //
    // Both facts are reported; neither is used to claim an update exists.
    recordCheckTime();

    logger.info('Update check complete', {
      currentVersion,
      latestKitRelease: release.version,
      comparable: false,
    });

    return {
      currentVersion,
      latestVersion: release.version,
      updateAvailable: false,
      releaseInfo: release,
      lastChecked: new Date(),
      error:
        `No MCP update to install: this MCP server (${currentVersion}) is deployed by its own `
        + `pipeline and publishes no releases. ${release.version} is the latest ORCHESTRATOR KIT `
        + 'release, which is a different version stream — run scripts/check-kit-version.mjs in '
        + 'your project to check the kit.',
    };
  } catch (error) {
    logger.error('Update check failed', error as Error);
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      releaseInfo: null,
      lastChecked: new Date(),
      error: (error as Error).message
    };
  }
}

/**
 * Install update from GitHub
 */
export async function installUpdate(releaseInfo: ReleaseInfo): Promise<{ success: boolean; message: string }> {
  logger.info('Starting MCP server update installation', {
    version: releaseInfo.version,
    tagName: releaseInfo.tagName
  });

  // [SCOPE 083 / T012] Refuse unless a local install opted in.
  // Below this line the function rm -rf's entries inside MCP_SERVER_PATH — which
  // resolves to process.cwd() — and copies a downloaded tree over the top. On the
  // hosted MCP that is the shared server's own working directory, and this runs
  // on behalf of any caller holding the project-admin role. Until now the only
  // thing preventing it was checkForUpdates() never returning a release.
  if (!selfUpgradeAllowed()) {
    logger.warn('Refused MCP self-upgrade: not enabled for this deployment', {
      path: MCP_SERVER_PATH,
      version: releaseInfo.version,
    });
    return {
      success: false,
      message:
        'Self-upgrade is not enabled for this MCP deployment. The hosted MCP is deployed by its '
        + 'own pipeline and cannot be upgraded by a tool call. For a local install, set '
        + `${SELF_UPGRADE_ENV}=true and retry.`,
    };
  }

  try {
    // Step 1: Backup current installation
    const backupPath = `${MCP_SERVER_PATH}.backup-${Date.now()}`;
    logger.info('Creating backup', { backupPath });
    
    try {
      execSync(`cp -r "${MCP_SERVER_PATH}" "${backupPath}"`, { stdio: 'ignore' });
    } catch (error) {
      // Windows fallback
      execSync(`xcopy "${MCP_SERVER_PATH}" "${backupPath}" /E /I /H /Y`, { stdio: 'ignore' });
    }

    // Step 2: Download and extract new version
    logger.info('Downloading update', { url: releaseInfo.tarballUrl });
    
    const tempDir = join(MCP_SERVER_PATH, '.update-temp');
    execSync(`mkdir -p "${tempDir}"`, { stdio: 'ignore' });
    
    // Download tarball
    const tarballPath = join(tempDir, 'update.tar.gz');
    execSync(`curl -L -o "${tarballPath}" "${releaseInfo.tarballUrl}"`, { stdio: 'inherit' });
    
    // Extract
    execSync(`tar -xzf "${tarballPath}" -C "${tempDir}"`, { stdio: 'ignore' });
    
    // Step 3: Find extracted directory and copy mcp-server files
    const extractedDir = execSync(`ls -d ${tempDir}/*/ 2>/dev/null || dir /b ${tempDir}`, { encoding: 'utf8' }).trim().split('\n')[0];
    const sourceMcpServer = join(tempDir, extractedDir, 'mcp-server');
    
    if (!existsSync(sourceMcpServer)) {
      throw new Error('Could not find mcp-server directory in downloaded release');
    }

    // Step 4: Install dependencies
    logger.info('Installing dependencies...');
    execSync('npm install', { 
      cwd: sourceMcpServer, 
      stdio: 'inherit' 
    });

    // Step 5: Build
    logger.info('Building MCP server...');
    execSync('npm run build', { 
      cwd: sourceMcpServer, 
      stdio: 'inherit' 
    });

    // Step 6: Replace current installation
    logger.info('Installing update...');
    
    // Remove old files except node_modules (keep for faster install)
    const preserveDirs = ['node_modules', '.env', 'dist'];
    const files = execSync(`ls -A "${MCP_SERVER_PATH}"`, { encoding: 'utf8' }).trim().split('\n');
    
    for (const file of files) {
      if (!preserveDirs.includes(file) && !file.startsWith('.')) {
        execSync(`rm -rf "${join(MCP_SERVER_PATH, file)}"`, { stdio: 'ignore' });
      }
    }

    // Copy new files
    execSync(`cp -r "${sourceMcpServer}/"* "${MCP_SERVER_PATH}/"`, { stdio: 'ignore' });

    // Step 7: Cleanup
    execSync(`rm -rf "${tempDir}"`, { stdio: 'ignore' });
    
    logger.info('Update installed successfully', { version: releaseInfo.version });

    return {
      success: true,
      message: `Successfully updated to version ${releaseInfo.version}. Please restart the MCP server to apply changes.`
    };

  } catch (error) {
    logger.error('Update installation failed', error as Error);
    return {
      success: false,
      message: `Update failed: ${(error as Error).message}`
    };
  }
}

/**
 * Check if we should skip the update check (throttling)
 */
function shouldSkipCheck(): boolean {
  try {
    if (!existsSync(LAST_CHECK_FILE)) {
      return false;
    }
    
    const lastCheck = readFileSync(LAST_CHECK_FILE, 'utf8');
    const lastCheckTime = new Date(lastCheck);
    const now = new Date();
    const hoursSinceLastCheck = (now.getTime() - lastCheckTime.getTime()) / (1000 * 60 * 60);
    
    return hoursSinceLastCheck < UPDATE_CHECK_INTERVAL_HOURS;
  } catch {
    return false;
  }
}

/**
 * Get last check time
 */
function getLastCheckTime(): Date | null {
  try {
    if (!existsSync(LAST_CHECK_FILE)) {
      return null;
    }
    return new Date(readFileSync(LAST_CHECK_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Record check time
 */
async function recordCheckTime(): Promise<void> {
  try {
    const fs = await import('fs');
    fs.writeFileSync(LAST_CHECK_FILE, new Date().toISOString());
  } catch (error) {
    logger.warn('Failed to record update check time', { error: (error as Error).message });
  }
}


/**
 * Auto-check on startup (non-blocking)
 */
export async function autoCheckOnStartup(): Promise<void> {
  try {
    const status = await checkForUpdates(false);
    
    if (status.updateAvailable && status.releaseInfo) {
      logger.info('╔════════════════════════════════════════════════════════╗');
      logger.info('║  MCP Server Update Available!                          ║');
      logger.info(`║  Current: ${(status.currentVersion ?? 'unknown').padEnd(47)} ║`);
      logger.info(`║  Latest:  ${status.latestVersion?.padEnd(47)} ║`);
      logger.info('║                                                        ║');
      logger.info('║  Run: project.upgrade_mcp to install                   ║');
      logger.info('╚════════════════════════════════════════════════════════╝');
    }
  } catch (error) {
    // Non-blocking - don't fail startup if check fails
    logger.warn('Auto-update check failed (non-critical)', { error: (error as Error).message });
  }

}

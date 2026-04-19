import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import logger from './logger.js';

// Stub for getCurrentVersion (should be replaced with actual version logic)
function getCurrentVersion(): string {
  // TODO: Replace with actual version retrieval logic
  return '0.0.0';
}

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
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseInfo: ReleaseInfo | null;
  lastChecked: Date | null;
  error?: string;
}

const GITHUB_API_BASE = 'https://api.github.com/repos/Cowboy-59/wxKanban';
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
  
  // Check if we should skip (unless forced)
  if (!force && shouldSkipCheck()) {
    logger.info('Skipping update check - already checked recently');
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      releaseInfo: null,
      lastChecked: getLastCheckTime()
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
        error: 'Could not fetch latest release'
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

    const comparison = compareVersions(currentVersion, release.version);
    const updateAvailable = comparison < 0;

    // Record check time
    recordCheckTime();

    logger.info('Update check complete', {
      currentVersion,
      latestVersion: release.version,
      updateAvailable
    });

    return {
      currentVersion,
      latestVersion: release.version,
      updateAvailable,
      releaseInfo: release,
      lastChecked: new Date()
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
      logger.info(`║  Current: ${status.currentVersion.padEnd(47)} ║`);
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

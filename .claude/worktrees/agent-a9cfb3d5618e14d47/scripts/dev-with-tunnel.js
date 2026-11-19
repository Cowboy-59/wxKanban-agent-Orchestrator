#!/usr/bin/env node

/**
 * Development server with Cloudflare Tunnel
 *
 * This script:
 * 1. Checks if cloudflared is installed
 * 2. Starts the normal dev servers (frontend + backend)
 * 3. Starts Cloudflare tunnels for both frontend AND backend
 * 4. Captures both tunnel URLs
 * 5. Updates packages/frontend/.env with tunnel URLs
 * 6. Handles cleanup on exit
 *
 * Usage: npm run dev:tunnel
 */

import { spawn, execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const FRONTEND_ENV_FILE = join(ROOT_DIR, "packages", "frontend", ".env");
const BACKEND_ENV_FILE = join(ROOT_DIR, "packages", "backend", ".env");
const VITE_CACHE_DIR = join(ROOT_DIR, "packages", "frontend", "node_modules", ".vite");

// Cloudflared executable - check for local copy first, then fall back to PATH
const LOCAL_CLOUDFLARED = join(ROOT_DIR, "cloudflared.exe");
const CLOUDFLARED_CMD = existsSync(LOCAL_CLOUDFLARED) ? LOCAL_CLOUDFLARED : "cloudflared";

// Ports
const FRONTEND_PORT = 5173;
const BACKEND_PORT = 3002;

let frontendTunnelProcess = null;
let backendTunnelProcess = null;
let devProcess = null;
let frontendTunnelUrl = null;
let backendTunnelUrl = null;

// ANSI color codes
const colors = {
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

function log(prefix, color, message) {
  console.log(`${color}[${prefix}]${colors.reset} ${message}`);
}

function checkCloudflared() {
  try {
    execSync(`"${CLOUDFLARED_CMD}" --version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function printInstallInstructions() {
  console.log(`
${colors.red}${colors.bold}cloudflared is not installed${colors.reset}

Please install it first:

${colors.cyan}Windows (winget):${colors.reset}
  winget install --id Cloudflare.cloudflared

${colors.cyan}Windows (scoop):${colors.reset}
  scoop install cloudflared

${colors.cyan}Windows (chocolatey):${colors.reset}
  choco install cloudflared

${colors.cyan}macOS (homebrew):${colors.reset}
  brew install cloudflared

${colors.cyan}Linux:${colors.reset}
  # Download from https://github.com/cloudflare/cloudflared/releases
  # Or use your package manager

After installing, run this command again.
`);
}

function clearViteCache() {
  if (existsSync(VITE_CACHE_DIR)) {
    log("cache", colors.yellow, "Clearing Vite cache to ensure fresh assets...");
    try {
      rmSync(VITE_CACHE_DIR, { recursive: true, force: true });
      log("cache", colors.green, "Vite cache cleared successfully");
    } catch (error) {
      log("cache", colors.yellow, `Could not clear cache: ${error.message}`);
    }
  } else {
    log("cache", colors.cyan, "No Vite cache to clear");
  }
}

function updateFrontendEnvFile(frontendUrl, backendUrl) {
  try {
    let envContent = "";

    if (existsSync(FRONTEND_ENV_FILE)) {
      envContent = readFileSync(FRONTEND_ENV_FILE, "utf8");
    }

    // Update or add VITE_TUNNEL_URL
    if (envContent.includes("VITE_TUNNEL_URL=")) {
      envContent = envContent.replace(
        /VITE_TUNNEL_URL=.*/,
        `VITE_TUNNEL_URL=${frontendUrl}`
      );
    } else {
      if (envContent && !envContent.endsWith("\n")) {
        envContent += "\n";
      }
      envContent += `VITE_TUNNEL_URL=${frontendUrl}\n`;
    }

    // Update or add VITE_API_TUNNEL_URL
    if (envContent.includes("VITE_API_TUNNEL_URL=")) {
      envContent = envContent.replace(
        /VITE_API_TUNNEL_URL=.*/,
        `VITE_API_TUNNEL_URL=${backendUrl}`
      );
    } else {
      envContent += `VITE_API_TUNNEL_URL=${backendUrl}\n`;
    }

    writeFileSync(FRONTEND_ENV_FILE, envContent, "utf8");
    log(
      "env",
      colors.green,
      `Updated packages/frontend/.env with tunnel URLs`
    );
  } catch (error) {
    log("env", colors.yellow, `Could not update .env: ${error.message}`);
  }
}

function updateBackendCors(tunnelUrl) {
  try {
    if (!existsSync(BACKEND_ENV_FILE)) {
      log("env", colors.yellow, "Backend .env not found, skipping CORS update");
      return;
    }

    let envContent = readFileSync(BACKEND_ENV_FILE, "utf8");

    // Check if ALLOWED_ORIGINS exists
    if (envContent.includes("ALLOWED_ORIGINS=")) {
      // Check if tunnel URL is already in the list
      const originsMatch = envContent.match(/ALLOWED_ORIGINS=(.*)/)
      if (originsMatch) {
        const currentOrigins = originsMatch[1]
        if (!currentOrigins.includes(".trycloudflare.com")) {
          // Add a wildcard pattern note - but we need to add the specific URL
          // Since CORS doesn't support wildcards, we'll add the specific tunnel URL
          const newOrigins = currentOrigins ? `${currentOrigins},${tunnelUrl}` : tunnelUrl
          envContent = envContent.replace(
            /ALLOWED_ORIGINS=.*/,
            `ALLOWED_ORIGINS=${newOrigins}`
          )
          writeFileSync(BACKEND_ENV_FILE, envContent, "utf8")
          log("env", colors.green, `Added tunnel URL to backend CORS`)
        }
      }
    } else {
      // Add ALLOWED_ORIGINS
      if (!envContent.endsWith("\n")) {
        envContent += "\n";
      }
      envContent += `ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,${tunnelUrl}\n`;
      writeFileSync(BACKEND_ENV_FILE, envContent, "utf8");
      log("env", colors.green, `Added ALLOWED_ORIGINS to backend .env`);
    }
  } catch (error) {
    log("env", colors.yellow, `Could not update backend .env: ${error.message}`);
  }
}

function startDevServers() {
  return new Promise((resolve) => {
    log("dev", colors.cyan, "Starting development servers...");

    // Use shell: true for Windows compatibility
    devProcess = spawn("npm", ["run", "dev"], {
      cwd: ROOT_DIR,
      shell: true,
      stdio: "pipe",
    });

    let frontendReady = false;
    let backendReady = false;

    const checkReady = () => {
      if (frontendReady && backendReady) {
        resolve();
      }
    };

    devProcess.stdout.on("data", (data) => {
      const output = data.toString();
      process.stdout.write(`${colors.cyan}[dev]${colors.reset} ${output}`);

      // Check for Vite ready message
      if (output.includes("Local:") && output.includes("5173")) {
        frontendReady = true;
        checkReady();
      }
      // Check for backend ready (Express listening)
      if (output.includes("listening") || output.includes("3002")) {
        backendReady = true;
        checkReady();
      }
    });

    devProcess.stderr.on("data", (data) => {
      process.stderr.write(`${colors.cyan}[dev]${colors.reset} ${data}`);
    });

    devProcess.on("error", (error) => {
      log("dev", colors.red, `Failed to start: ${error.message}`);
    });

    devProcess.on("close", (code) => {
      if (code !== 0 && code !== null) {
        log("dev", colors.red, `Exited with code ${code}`);
      }
    });

    // Resolve after timeout even if we didn't detect ready messages
    setTimeout(() => {
      if (!frontendReady || !backendReady) {
        log("dev", colors.yellow, "Proceeding (servers may still be starting)...");
        resolve();
      }
    }, 10000);
  });
}

function startTunnel(name, port, color) {
  return new Promise((resolve, reject) => {
    log(name, color, `Starting Cloudflare tunnel for localhost:${port}...`);

    const tunnelProcess = spawn(
      CLOUDFLARED_CMD,
      ["tunnel", "--url", `http://localhost:${port}`],
      {
        cwd: ROOT_DIR,
        shell: true,
      }
    );

    let tunnelUrlFound = false;

    const handleOutput = (data) => {
      const output = data.toString();

      // Look for tunnel URL in output
      const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (urlMatch && !tunnelUrlFound) {
        tunnelUrlFound = true;
        log(name, color + colors.bold, `Tunnel URL: ${urlMatch[0]}`);
        resolve({ url: urlMatch[0], process: tunnelProcess });
      }
    };

    tunnelProcess.stdout.on("data", handleOutput);
    tunnelProcess.stderr.on("data", handleOutput);

    tunnelProcess.on("error", (error) => {
      log(name, colors.red, `Failed to start: ${error.message}`);
      reject(error);
    });

    tunnelProcess.on("close", (code) => {
      if (code !== 0 && code !== null) {
        log(name, colors.red, `Exited with code ${code}`);
      }
    });

    // Timeout if URL not found in 30 seconds
    setTimeout(() => {
      if (!tunnelUrlFound) {
        reject(new Error(`Timeout waiting for ${name} tunnel URL`));
      }
    }, 30000);
  });
}

function cleanup() {
  log("cleanup", colors.yellow, "Shutting down...");

  const killProcess = (proc, name) => {
    if (!proc) return;

    if (process.platform === "win32") {
      try {
        execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: "ignore" });
      } catch {
        proc.kill("SIGTERM");
      }
    } else {
      proc.kill("SIGTERM");
    }
  };

  killProcess(devProcess, "dev");
  killProcess(frontendTunnelProcess, "frontend tunnel");
  killProcess(backendTunnelProcess, "backend tunnel");

  // Force exit after 2 seconds
  setTimeout(() => {
    process.exit(0);
  }, 2000);
}

// Handle cleanup on exit
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// Main execution
(async () => {
  try {
    console.log(
      `\n${colors.bold}${colors.green}Starting development with Cloudflare Tunnels${colors.reset}\n`
    );

    // Step 0: Check if cloudflared is installed
    if (!checkCloudflared()) {
      printInstallInstructions();
      process.exit(1);
    }

    log("check", colors.green, `cloudflared found: ${CLOUDFLARED_CMD}`);

    // Step 1: Clear Vite cache to ensure fresh assets via tunnel
    clearViteCache();

    // Step 2: Start dev servers
    await startDevServers();

    // Step 3: Start both tunnels in parallel
    console.log(); // Empty line for readability
    log("tunnel", colors.magenta, "Starting tunnels for frontend and backend...");

    const [frontendResult, backendResult] = await Promise.all([
      startTunnel("frontend", FRONTEND_PORT, colors.magenta),
      startTunnel("backend", BACKEND_PORT, colors.blue)
    ]);

    frontendTunnelUrl = frontendResult.url;
    backendTunnelUrl = backendResult.url;
    frontendTunnelProcess = frontendResult.process;
    backendTunnelProcess = backendResult.process;

    // Step 4: Update env files
    updateFrontendEnvFile(frontendTunnelUrl, backendTunnelUrl);
    updateBackendCors(frontendTunnelUrl);

    console.log(
      `\n${colors.bold}${colors.green}========================================${colors.reset}`
    );
    console.log(
      `${colors.bold}${colors.green}  All services running!${colors.reset}`
    );
    console.log(
      `${colors.bold}${colors.green}========================================${colors.reset}\n`
    );
    console.log(`${colors.cyan}Frontend (local):${colors.reset}   http://localhost:${FRONTEND_PORT}`);
    console.log(`${colors.cyan}Backend (local):${colors.reset}    http://localhost:${BACKEND_PORT}`);
    console.log(`${colors.magenta}Frontend (tunnel):${colors.reset}  ${frontendTunnelUrl}`);
    console.log(`${colors.blue}Backend (tunnel):${colors.reset}   ${backendTunnelUrl}`);
    console.log(
      `\n${colors.yellow}IMPORTANT: For remote access, use the frontend tunnel URL.${colors.reset}`
    );
    console.log(
      `${colors.yellow}The frontend will automatically use the backend tunnel for API calls.${colors.reset}`
    );
    console.log(
      `\n${colors.yellow}Note: You may need to restart the frontend dev server for${colors.reset}`
    );
    console.log(
      `${colors.yellow}the new VITE_API_TUNNEL_URL to take effect.${colors.reset}`
    );
    console.log(
      `\n${colors.yellow}Press Ctrl+C to stop all services${colors.reset}\n`
    );
  } catch (error) {
    log("error", colors.red, error.message);
    cleanup();
    process.exit(1);
  }
})();

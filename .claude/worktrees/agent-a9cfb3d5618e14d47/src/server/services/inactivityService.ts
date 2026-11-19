/**
 * Inactivity Detection Service
 * Monitors user activity and automatically pauses timers after inactivity
 */

import { logger } from '../lib/logger.js';
import { TimeTrackingService } from './TimeTrackingService.js';

// Inactivity configuration
const INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds

// Track user activity timestamps
const userActivityMap = new Map<string, number>(); // userid -> last activity timestamp
const userTimersMap = new Map<string, string>(); // userid -> active timer entry ID
let checkInterval: NodeJS.Timeout | null = null;

/**
 * Record user activity
 * Call this whenever user performs an action (mouse move, key press, API call)
 */
export function recordActivity(userid: string): void {
  userActivityMap.set(userid, Date.now());
}

/**
 * Get time since last activity for a user
 */
export function getInactiveDurationMs(userid: string): number {
  const lastActivity = userActivityMap.get(userid);
  if (!lastActivity) {
    return Infinity; // No activity recorded
  }
  return Date.now() - lastActivity;
}

/**
 * Check if user is inactive
 */
export function isUserInactive(userid: string): boolean {
  return getInactiveDurationMs(userid) > INACTIVITY_THRESHOLD_MS;
}

/**
 * Start monitoring for inactivity
 */
export function startInactivityMonitoring(): void {
  if (checkInterval) {
    return; // Already running
  }

  logger.info('Starting inactivity monitoring');

  checkInterval = setInterval(async () => {
    await checkInactiveUsers();
  }, CHECK_INTERVAL_MS);
}

/**
 * Stop inactivity monitoring
 */
export function stopInactivityMonitoring(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    logger.info('Stopped inactivity monitoring');
  }
}

/**
 * Check all users for inactivity and pause timers if needed
 */
async function checkInactiveUsers(): Promise<void> {
  const now = Date.now();

  for (const [userid, lastActivity] of userActivityMap.entries()) {
    const inactiveDuration = now - lastActivity;

    if (inactiveDuration > INACTIVITY_THRESHOLD_MS) {
      // User is inactive, check if they have an active timer
      const activeTimerId = userTimersMap.get(userid);

      if (activeTimerId) {
        try {
          // Pause the timer (stop it)
          await TimeTrackingService.stopTimer(activeTimerId, userid);

          logger.info(
            { userid, timerId: activeTimerId, inactiveMs: inactiveDuration },
            'Timer auto-paused due to inactivity'
          );

          // Remove from active timers map
          userTimersMap.delete(userid);

          // Optionally: Create a notification for the user
          // await createInactivityNotification(userid, activeTimerId);
        } catch (error) {
          logger.error(
            { error: error instanceof Error ? error.message : 'Unknown error', userid, timerId: activeTimerId },
            'Failed to auto-pause timer due to inactivity'
          );
        }
      }
    }
  }
}

/**
 * Register an active timer for a user
 * Call this when a user starts a timer
 */
export function registerActiveTimer(userid: string, entryId: string): void {
  userTimersMap.set(userid, entryId);
  recordActivity(userid); // Reset activity timestamp
  logger.debug({ userid, entryId }, 'Registered active timer for inactivity monitoring');
}

/**
 * Unregister a timer when stopped manually
 */
export function unregisterActiveTimer(userid: string): void {
  userTimersMap.delete(userid);
  logger.debug({ userid }, 'Unregistered active timer');
}

/**
 * Get monitoring status
 */
export function getMonitoringStatus(): {
  isRunning: boolean;
  monitoredUsers: number;
  activeTimers: number;
  thresholdMinutes: number;
} {
  return {
    isRunning: checkInterval !== null,
    monitoredUsers: userActivityMap.size,
    activeTimers: userTimersMap.size,
    thresholdMinutes: INACTIVITY_THRESHOLD_MS / 60000,
  };
}

/**
 * Middleware to record activity on API requests
 */
export function activityMiddleware(req: any, _res: any, next: any): void {
  const userid = req.userid;
  if (userid) {
    recordActivity(userid);
  }
  next();
}

/**
 * Initialize inactivity monitoring
 * Call this on server startup
 */
export function initializeInactivityMonitoring(): void {
  startInactivityMonitoring();
  logger.info('Inactivity monitoring initialized');
}

/**
 * Shutdown inactivity monitoring
 * Call this on server shutdown
 */
export function shutdownInactivityMonitoring(): void {
  stopInactivityMonitoring();
  userActivityMap.clear();
  userTimersMap.clear();
  logger.info('Inactivity monitoring shut down');
}

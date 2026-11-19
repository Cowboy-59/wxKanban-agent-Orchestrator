import { db } from '~/db/client.js';
import { pmsystemconnections } from '~/db/schema/pmSystemConnection';

import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { logger } from '~/server/lib/logger';

/**
 * PMIntegrationService
 * Handles OAuth2 connections to external PM systems
 * Supported: Jira, Monday.com, Asana, Trello
 */

export type PMSystem = 'jira' | 'monday' | 'asana' | 'trello';

export interface PMSystemConnection {
  connectionId: string;
  userId: string;
  companyId: string;
  systemType: PMSystem;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  systemUserId: string;
  systemUserName: string;
  isActive: boolean;
  lastSyncAt?: Date;
  createdAt: Date;
}

export interface OAuth2Credentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface PMSystemConfig {
  name: string;
  authUrl: string;
  tokenUrl: string;
  apiBaseUrl: string;
  scopes: string[];
  credentials: OAuth2Credentials;
}

// OAuth2 Configuration for each PM system
const PM_SYSTEMS_CONFIG: Record<PMSystem, PMSystemConfig> = {
  jira: {
    name: 'Jira Cloud',
    authUrl: 'https://auth.atlassian.com/authorize',
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    apiBaseUrl: 'https://api.atlassian.com',
    scopes: [
      'read:jira-work',
      'write:jira-work',
      'read:jira-user',
      'manage:jira-project',
    ],
    credentials: {
      clientId: process.env.JIRA_CLIENT_ID || '',
      clientSecret: process.env.JIRA_CLIENT_SECRET || '',
      redirectUri: `${process.env.API_URL || 'http://localhost:3001'}/api/pm-systems/oauth/jira/callback`,
    },
  },
  monday: {
    name: 'Monday.com',
    authUrl: 'https://auth.monday.com/oauth2/authorize',
    tokenUrl: 'https://auth.monday.com/oauth2/token',
    apiBaseUrl: 'https://api.monday.com/graphql',
    scopes: ['boards:read', 'boards:write', 'users:read'],
    credentials: {
      clientId: process.env.MONDAY_CLIENT_ID || '',
      clientSecret: process.env.MONDAY_CLIENT_SECRET || '',
      redirectUri: `${process.env.API_URL || 'http://localhost:3001'}/api/pm-systems/oauth/monday/callback`,
    },
  },
  asana: {
    name: 'Asana',
    authUrl: 'https://app.asana.com/-/oauth_authorize',
    tokenUrl: 'https://app.asana.com/-/oauth_token',
    apiBaseUrl: 'https://app.asana.com/api/1.0',
    scopes: ['default'],
    credentials: {
      clientId: process.env.ASANA_CLIENT_ID || '',
      clientSecret: process.env.ASANA_CLIENT_SECRET || '',
      redirectUri: `${process.env.API_URL || 'http://localhost:3001'}/api/pm-systems/oauth/asana/callback`,
    },
  },
  trello: {
    name: 'Trello',
    authUrl: 'https://trello.com/app-key/authorize',
    tokenUrl: 'https://api.trello.com/1/tokens',
    apiBaseUrl: 'https://api.trello.com/1',
    scopes: ['read', 'write'],
    credentials: {
      clientId: process.env.TRELLO_CLIENT_ID || '',
      clientSecret: process.env.TRELLO_CLIENT_SECRET || '',
      redirectUri: `${process.env.API_URL || 'http://localhost:3001'}/api/pm-systems/oauth/trello/callback`,
    },
  },
};

export class PMIntegrationService {
  /**
   * Generate OAuth authorization URL
   * @param system - PM system type
   * @param state - CSRF token for security
   * @returns Authorization URL
   */
  static generateAuthUrl(system: PMSystem, state: string): string {
    const config = PM_SYSTEMS_CONFIG[system];
    const params = new URLSearchParams({
      client_id: config.credentials.clientId,
      redirect_uri: config.credentials.redirectUri,
      response_type: 'code',
      state,
      scope: config.scopes.join(' '),
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  /**
   * Generate CSRF state token for OAuth flow
   * @returns Random state token
   */
  static generateStateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Exchange authorization code for access token
   * @param system - PM system type
   * @param code - Authorization code from OAuth provider
   * @returns Access token data
   */
  static async exchangeCodeForToken(
    system: PMSystem,
    code: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    const config = PM_SYSTEMS_CONFIG[system];

    try {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: config.credentials.clientId,
          client_secret: config.credentials.clientSecret,
          redirect_uri: config.credentials.redirectUri,
        }).toString(),
      });

      if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      };
    } catch (error) {
      logger.error({ error, system }, 'Token exchange failed');
      throw new Error('Failed to exchange authorization code for token');
    }
  }

  /**
   * Store PM system connection
   * @param userId - User ID
   * @param companyId - Company ID
   * @param system - PM system type
   * @param accessToken - OAuth access token
   * @param systemUserId - User ID in the PM system
   * @param systemUserName - Username in the PM system
   * @returns Connection details
   */
  static async storeConnection(
    userId: string,
    _companyId: string,
    system: PMSystem,
    accessToken: string,
    _systemUserId: string,
    _systemUserName: string,
    refreshToken?: string,
    expiresIn?: number
  ): Promise<PMSystemConnection> {
    try {
      const tokenExpiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000)
        : new Date(Date.now() + 24 * 60 * 60 * 1000); // Default to 24 hours if not provided

      const connection = await db
        .insert(pmsystemconnections)
        .values({
          userid: userId,
          pmsystem: system,
          accesstoken: accessToken, // Encrypted at rest in production
          refreshtoken: refreshToken || '',
          expiresat: tokenExpiresAt,
          lastsyncsat: null,
          syncstatus: 'active',
          createdat: new Date(),
          updatedat: new Date(),
        })
        .returning();

      return this.formatConnection(connection[0]);
    } catch (error) {
      logger.error({ error }, 'Failed to store PM system connection');
      throw new Error('Failed to store PM system connection');
    }
  }

  /**
   * Get user's PM system connections
   * @param userId - User ID
   * @returns List of connections
   */
  static async getUserConnections(userId: string): Promise<PMSystemConnection[]> {
    try {
      const connections = await db
        .select()
        .from(pmsystemconnections)
        .where(eq(pmsystemconnections.userid, userId));

      return connections.map(conn => this.formatConnection(conn));
    } catch (error) {
      logger.error({ error }, 'Failed to get user connections');
      throw new Error('Failed to get PM system connections');
    }
  }

  /**
   * Get active PM system connection for user and system type
   * @param userId - User ID
   * @param system - PM system type
   * @returns Connection or null
   */
  static async getActiveConnection(
    userId: string,
    system: PMSystem
  ): Promise<PMSystemConnection | null> {
    try {
      const connection = await db
        .select()
        .from(pmsystemconnections)
        .where(
          and(
            eq(pmsystemconnections.userid, userId),
            eq(pmsystemconnections.pmsystem, system),
            eq(pmsystemconnections.syncstatus, "active")
          )
        )
        .then(rows => rows[0]);

      return connection ? this.formatConnection(connection) : null;
    } catch (error) {
      logger.error({ error }, 'Failed to get active connection');
      return null;
    }
  }

  /**
   * Update last sync time
   * @param connectionId - Connection ID
   */
  static async updateLastSyncTime(connectionId: string): Promise<void> {
    try {
      await db
        .update(pmsystemconnections)
        .set({
          lastsyncsat: new Date(),
          updatedat: new Date(),
        })
        .where(eq(pmsystemconnections.id, connectionId));
    } catch (error) {
      logger.error({ error }, 'Failed to update last sync time');
      // Don't throw - this is non-critical
    }
  }

  /**
   * Disconnect PM system
   * @param connectionId - Connection ID
   */
  static async disconnectSystem(connectionId: string): Promise<void> {
    try {
      await db
        .update(pmsystemconnections)
        .set({
          syncstatus: 'failed',
          updatedat: new Date(),
        })
        .where(eq(pmsystemconnections.id, connectionId));

      logger.info({ connectionId }, 'PM system disconnected');
    } catch (error) {
      logger.error({ error }, 'Failed to disconnect PM system');
      throw new Error('Failed to disconnect PM system');
    }
  }

  /**
   * Format database connection to API response
   */
  private static formatConnection(conn: any): PMSystemConnection {
    return {
      connectionId: conn.id,
      userId: conn.userid,
      companyId: conn.userid, // Use userid as placeholder
      systemType: conn.pmsystem as PMSystem,
      accessToken: conn.accesstoken,
      refreshToken: conn.refreshtoken,
      tokenExpiresAt: conn.expiresat,
      systemUserId: conn.userid, // Use userid as placeholder
      systemUserName: conn.pmsystem, // Use system name as placeholder
      isActive: conn.syncstatus === "active",
      lastSyncAt: conn.lastsyncsat,
      createdAt: conn.createdat,
    };
  }

  /**
   * Get PM system configuration
   * @param system - PM system type
   */
  static getSystemConfig(system: PMSystem): PMSystemConfig {
    return PM_SYSTEMS_CONFIG[system];
  }

  /**
   * Check if system is configured (has credentials)
   * @param system - PM system type
   */
  static isSystemConfigured(system: PMSystem): boolean {
    const config = PM_SYSTEMS_CONFIG[system];
    return !!(config.credentials.clientId && config.credentials.clientSecret);
  }

  /**
   * Get list of available PM systems
   */
  static getAvailableSystems(): Array<{
    type: PMSystem;
    name: string;
    isConfigured: boolean;
  }> {
    const systems: PMSystem[] = ['jira', 'monday', 'asana', 'trello'];
    return systems.map(system => ({
      type: system,
      name: PM_SYSTEMS_CONFIG[system].name,
      isConfigured: this.isSystemConfigured(system),
    }));
  }
}

export default PMIntegrationService;

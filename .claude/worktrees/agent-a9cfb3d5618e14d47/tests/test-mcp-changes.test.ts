/**
 * MCP Changes Test Suite
 * 
 * Tests for:
 * 1. CLI Process Error Monitoring
 * 2. API Token Reuse on Kit Regeneration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../src/db/client';
import { apitokens } from '../src/db/schema/apitoken';
import { eq, and, isNull } from 'drizzle-orm';
import { apiTokenService } from '../src/server/services/ApiTokenService';
import { kitGenerationService } from '../src/server/services/KitGenerationService';
import { MCPClient } from '../cli/mcp-client';
import * as path from 'path';
import * as fs from 'fs';

// Test configuration
const TEST_TIMEOUT = 30000;
const TEST_PROJECT_ID = 'test-project-mcp-changes';
const TEST_USER_ID = 'test-user-mcp';
const TEST_COMPANY_ID = 'test-company-mcp';

describe('MCP Changes - Thorough Testing', () => {
  
  // ==========================================
  // Test 1: CLI Error Monitoring
  // ==========================================
  describe('CLI Process Error Monitoring', () => {
    
    it('should detect missing DATABASE_URL error', async () => {
      const serverPath = path.resolve(__dirname, '../mcp-server/dist/index-http.js');
      
      // Skip if MCP server not built
      if (!fs.existsSync(serverPath)) {
        console.log('⚠️  MCP server not built, skipping test');
        return;
      }

      const client = new MCPClient({
        serverPath,
        env: {
          // Intentionally omit DATABASE_URL
          API_KEY: 'test-key',
        },
        timeout: 5000,
      });

      try {
        await client.connect();
        // Should not reach here
        expect(false).toBe(true);
      } catch (error) {
        const errorMessage = (error as Error).message;
        expect(errorMessage).toContain('DATABASE_URL');
        expect(errorMessage).toContain('ACTION REQUIRED');
      } finally {
        await client.disconnect().catch(() => {});
      }
    }, TEST_TIMEOUT);

    it('should detect missing API_KEY error', async () => {
      const serverPath = path.resolve(__dirname, '../mcp-server/dist/index-http.js');
      
      if (!fs.existsSync(serverPath)) {
        console.log('⚠️  MCP server not built, skipping test');
        return;
      }

      const client = new MCPClient({
        serverPath,
        env: {
          DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
          // Intentionally omit API_KEY
        },
        timeout: 5000,
      });

      try {
        await client.connect();
        expect(false).toBe(true);
      } catch (error) {
        const errorMessage = (error as Error).message;
        expect(errorMessage).toContain('API_KEY');
        expect(errorMessage).toContain('ACTION REQUIRED');
      } finally {
        await client.disconnect().catch(() => {});
      }
    }, TEST_TIMEOUT);

    it('should detect invalid WXKANBAN_API_TOKEN for decryption', async () => {
      const serverPath = path.resolve(__dirname, '../mcp-server/dist/index-http.js');
      
      if (!fs.existsSync(serverPath)) {
        console.log('⚠️  MCP server not built, skipping test');
        return;
      }

      // Create an encrypted URL with a valid token
      const validToken = 'wxk_live_' + 'a'.repeat(32);
      const encryptedUrl = 'iv123:authTag456:encrypted789';

      const client = new MCPClient({
        serverPath,
        env: {
          DATABASE_URL_ENCRYPTED: encryptedUrl,
          WXKANBAN_API_TOKEN: 'invalid-token',
          API_KEY: 'test-key',
        },
        timeout: 5000,
      });

      try {
        await client.connect();
        expect(false).toBe(true);
      } catch (error) {
        const errorMessage = (error as Error).message;
        // Should detect decryption failure
        expect(
          errorMessage.includes('decrypt') || 
          errorMessage.includes('token') ||
          errorMessage.includes('Failed')
        ).toBe(true);
      } finally {
        await client.disconnect().catch(() => {});
      }
    }, TEST_TIMEOUT);

    it('should provide actionable error messages', async () => {
      const serverPath = path.resolve(__dirname, '../mcp-server/dist/index-http.js');
      
      if (!fs.existsSync(serverPath)) {
        console.log('⚠️  MCP server not built, skipping test');
        return;
      }

      const client = new MCPClient({
        serverPath,
        env: {}, // Empty env
        timeout: 5000,
      });

      try {
        await client.connect();
        expect(false).toBe(true);
      } catch (error) {
        const errorMessage = (error as Error).message;
        // Should contain actionable guidance
        expect(errorMessage).toContain('ACTION');
        expect(errorMessage).toContain('fix');
        expect(errorMessage).toContain('.env');
      } finally {
        await client.disconnect().catch(() => {});
      }
    }, TEST_TIMEOUT);

    it('should kill process on critical errors', async () => {
      const serverPath = path.resolve(__dirname, '../mcp-server/dist/index-http.js');
      
      if (!fs.existsSync(serverPath)) {
        console.log('⚠️  MCP server not built, skipping test');
        return;
      }

      const client = new MCPClient({
        serverPath,
        env: {}, // Empty env to trigger error
        timeout: 5000,
      });

      let processExited = false;
      
      try {
        // @ts-ignore - accessing private property for testing
        client.on('disconnect', (code) => {
          if (code !== 0) processExited = true;
        });
        
        await client.connect();
      } catch (error) {
        // Expected to fail
        // Give time for process to exit
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // @ts-ignore - accessing private property for testing
        expect(client.process === null || client.process?.killed || processExited).toBe(true);
      } finally {
        await client.disconnect().catch(() => {});
      }
    }, TEST_TIMEOUT);
  });

  // ==========================================
  // Test 2: Token Reuse on Kit Regeneration
  // ==========================================
  describe('API Token Reuse on Kit Regeneration', () => {
    
    beforeAll(async () => {
      // Clean up any existing test tokens
      await db.delete(apitokens)
        .where(eq(apitokens.userid, TEST_USER_ID));
    });

    afterAll(async () => {
      // Clean up test tokens
      await db.delete(apitokens)
        .where(eq(apitokens.userid, TEST_USER_ID));
    });

    it('should create new token without projectId', async () => {
      const result = await apiTokenService.getOrCreateToken(
        TEST_USER_ID,
        TEST_COMPANY_ID,
        'Test Token No Project'
      );

      expect(result.token).toBeTruthy();
      expect(result.record).toBeTruthy();
      expect(result.record.userid).toBe(TEST_USER_ID);
      expect(result.record.projectid).toBeNull();
    });

    it('should create token with projectId association', async () => {
      const result = await apiTokenService.getOrCreateToken(
        TEST_USER_ID,
        TEST_COMPANY_ID,
        'Test Token With Project',
        TEST_PROJECT_ID
      );

      expect(result.token).toBeTruthy();
      expect(result.record).toBeTruthy();
      expect(result.record.projectid).toBe(TEST_PROJECT_ID);
    });

    it('should find existing token for project', async () => {
      // First, create a token for the project
      const firstResult = await apiTokenService.getOrCreateToken(
        TEST_USER_ID,
        TEST_COMPANY_ID,
        'First Token',
        TEST_PROJECT_ID
      );

      expect(firstResult.token).toBeTruthy();
      const firstTokenId = firstResult.record.id;

      // Now try to get token for same project - should find existing
      const existingToken = await apiTokenService.getExistingTokenForProject(
        TEST_USER_ID,
        TEST_COMPANY_ID,
        TEST_PROJECT_ID
      );

      expect(existingToken).not.toBeNull();
      expect(existingToken?.record.id).toBe(firstTokenId);
    });

    it('should reuse existing token on regeneration', async () => {
      // Create initial token
      const initialResult = await apiTokenService.getOrCreateToken(
        TEST_USER_ID,
        TEST_COMPANY_ID,
        'Initial Token',
        TEST_PROJECT_ID
      );

      const initialTokenId = initialResult.record.id;
      const initialTokenHash = initialResult.record.tokenhash;

      // Simulate kit regeneration by calling getOrCreateToken again
      const regenerationResult = await apiTokenService.getOrCreateToken(
        TEST_USER_ID,
        TEST_COMPANY_ID,
        'Regenerated Token',
        TEST_PROJECT_ID
      );

      // Should return the existing token record
      expect(regenerationResult.record.id).toBe(initialTokenId);
      expect(regenerationResult.record.tokenhash).toBe(initialTokenHash);
    });

    it('should create different tokens for different projects', async () => {
      const project1 = 'project-1-' + Date.now();
      const project2 = 'project-2-' + Date.now();

      const token1 = await apiTokenService.getOrCreateToken(
        TEST_USER_ID,
        TEST_COMPANY_ID,
        'Token 1',
        project1
      );

      const token2 = await apiTokenService.getOrCreateToken(
        TEST_USER_ID,
        TEST_COMPANY_ID,
        'Token 2',
        project2
      );

      expect(token1.record.id).not.toBe(token2.record.id);
      expect(token1.record.projectid).toBe(project1);
      expect(token2.record.projectid).toBe(project2);
    });

    it('should handle token validation correctly', async () => {
      const result = await apiTokenService.createToken(
        TEST_USER_ID,
        TEST_COMPANY_ID,
        'Validation Test Token'
      );

      // Validate the token
      const validated = await apiTokenService.validateToken(result.token);
      expect(validated).not.toBeNull();
      expect(validated?.id).toBe(result.record.id);

      // Validate invalid token
      const invalid = await apiTokenService.validateToken('invalid-token');
      expect(invalid).toBeNull();
    });

    it('should revoke tokens correctly', async () => {
      const result = await apiTokenService.createToken(
        TEST_USER_ID,
        TEST_COMPANY_ID,
        'Token to Revoke'
      );

      // Revoke the token
      const revoked = await apiTokenService.revokeToken(result.record.id, TEST_USER_ID);
      expect(revoked).toBe(true);

      // Try to validate revoked token
      const validated = await apiTokenService.validateToken(result.token);
      expect(validated).toBeNull();
    });
  });

  // ==========================================
  // Test 3: Integration - Kit Generation with Token Reuse
  // ==========================================
  describe('Kit Generation Integration', () => {
    
    const INTEGRATION_PROJECT_ID = 'integration-test-project';
    const INTEGRATION_USER_ID = 'integration-test-user';
    const INTEGRATION_COMPANY_ID = 'integration-test-company';

    afterAll(async () => {
      // Clean up
      await db.delete(apitokens)
        .where(eq(apitokens.userid, INTEGRATION_USER_ID));
    });

    it('should generate kit with project-associated token', async () => {
      // This test verifies the integration between KitGenerationService and ApiTokenService
      
      // First kit generation
      const firstKit = await kitGenerationService.generateKit({
        projectId: INTEGRATION_PROJECT_ID,
        userId: INTEGRATION_USER_ID,
        companyId: INTEGRATION_COMPANY_ID,
        primaryAi: 'claude-code',
        importMode: false,
      });

      expect(firstKit.status).toBe('ready');
      expect(firstKit.kitId).toBeTruthy();

      // Check that a token was created and associated with the project
      const [tokenRecord] = await db
        .select()
        .from(apitokens)
        .where(
          and(
            eq(apitokens.userid, INTEGRATION_USER_ID),
            eq(apitokens.projectid, INTEGRATION_PROJECT_ID),
            isNull(apitokens.revokedat)
          )
        )
        .limit(1);

      expect(tokenRecord).toBeTruthy();
      const firstTokenId = tokenRecord.id;

      // Second kit generation (regeneration)
      const secondKit = await kitGenerationService.generateKit({
        projectId: INTEGRATION_PROJECT_ID,
        userId: INTEGRATION_USER_ID,
        companyId: INTEGRATION_COMPANY_ID,
        primaryAi: 'claude-code',
        importMode: false,
      });

      expect(secondKit.status).toBe('ready');

      // Verify the same token is still associated (not a new one created)
      const [tokenRecordAfter] = await db
        .select()
        .from(apitokens)
        .where(
          and(
            eq(apitokens.userid, INTEGRATION_USER_ID),
            eq(apitokens.projectid, INTEGRATION_PROJECT_ID),
            isNull(apitokens.revokedat)
          )
        )
        .limit(1);

      expect(tokenRecordAfter).toBeTruthy();
      expect(tokenRecordAfter.id).toBe(firstTokenId);
    }, TEST_TIMEOUT * 2);
  });

  // ==========================================
  // Test 4: Database Schema Verification
  // ==========================================
  describe('Database Schema', () => {
    
    it('should have projectid column in apitokens table', async () => {
      // Query to check if projectid column exists
      const result = await db.execute(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'apitokens' 
        AND column_name = 'projectid'
      `);

      // @ts-ignore
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should allow null projectid for backward compatibility', async () => {
      const result = await apiTokenService.createToken(
        TEST_USER_ID,
        TEST_COMPANY_ID,
        'No Project Token'
      );

      expect(result.record.projectid).toBeNull();
    });
  });
});

// Run tests
console.log('🧪 MCP Changes Test Suite');
console.log('==========================');

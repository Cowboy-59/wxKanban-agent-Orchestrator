import { describe, it, expect, beforeAll } from 'vitest';
import { checkDatabaseConnection } from '../src/db/connection.js';
import config from '../src/config.js';

describe('MCP Project Hub', () => {
  beforeAll(async () => {
    const connected = await checkDatabaseConnection();
    expect(connected).toBe(true);
  });

  it('should connect to database', () => {
    // Database connection is tested in beforeAll
    expect(true).toBe(true);
  });

  it('should have valid configuration', () => {
    // Configuration is loaded in config.ts
    // If we got here without errors, config is valid
    expect(config.databaseUrl).toBeDefined();
    expect(config.apiKey).toBeDefined();
    expect(config.transport).toBeDefined();
  });
});

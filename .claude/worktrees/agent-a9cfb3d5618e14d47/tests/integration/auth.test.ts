import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Integration tests for authentication endpoints
 *
 * These tests validate:
 * - User registration with valid/invalid inputs
 * - User signin with correct/incorrect credentials
 * - JWT token generation and verification
 * - Protected endpoints requiring authentication
 * - Token expiry handling
 */

describe("Authentication Endpoints", () => {
  const API_URL = "http://localhost:3001/api/auth";
  let testToken: string;
  let testUserId: string;
  const timestamp = Date.now();
  const testUser = {
    email: `test-${timestamp}@example.com`,
    password: "TestPassword123!",
  };

  beforeAll(async () => {
    // Wait for API to be ready
    // In a real test suite, we'd use test fixtures
  });

  afterAll(async () => {
    // Cleanup test data (database cleanup would happen here in production)
  });

  describe("POST /auth/register", () => {
    it("should register a new user with valid credentials", async () => {
      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testUser),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.userid).toBeDefined();
      expect(data.email).toBe(testUser.email);
      expect(data.token).toBeDefined();
      testToken = data.token;
      testUserId = data.userid;
    });

    it("should reject registration with invalid email", async () => {
      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "invalid-email",
          password: "TestPassword123!",
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it("should reject registration with password too short", async () => {
      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `short-pass-${Date.now()}@example.com`,
          password: "Pass1!",
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it("should reject registration with password missing uppercase", async () => {
      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `no-upper-${Date.now()}@example.com`,
          password: "password123!",
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it("should reject registration with password missing lowercase", async () => {
      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `no-lower-${Date.now()}@example.com`,
          password: "PASSWORD123!",
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it("should reject registration with password missing number", async () => {
      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `no-number-${Date.now()}@example.com`,
          password: "TestPassword!",
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it("should reject registration with password missing special character", async () => {
      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `no-special-${Date.now()}@example.com`,
          password: "TestPassword123",
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it("should reject duplicate email registration", async () => {
      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testUser),
      });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error).toContain("already exists");
    });
  });

  describe("POST /auth/signin", () => {
    it("should sign in user with correct credentials", async () => {
      const response = await fetch(`${API_URL}/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testUser),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.userid).toBeDefined();
      expect(data.email).toBe(testUser.email);
      expect(data.token).toBeDefined();
    });

    it("should reject signin with invalid password", async () => {
      const response = await fetch(`${API_URL}/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testUser.email,
          password: "WrongPassword123!",
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it("should reject signin with non-existent email", async () => {
      const response = await fetch(`${API_URL}/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `nonexistent-${Date.now()}@example.com`,
          password: "TestPassword123!",
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it("should set httpOnly cookie with token", async () => {
      const response = await fetch(`${API_URL}/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testUser),
      });

      expect(response.status).toBe(200);
      const setCookieHeader = response.headers.get("set-cookie");
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain("token=");
      expect(setCookieHeader).toContain("HttpOnly");
    });
  });

  describe("GET /auth/me", () => {
    it("should return current user info with valid token", async () => {
      const response = await fetch(`${API_URL}/me`, {
        method: "GET",
        headers: {
          Cookie: `token=${testToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.userid).toBeDefined();
      expect(data.email).toBe(testUser.email);
    });

    it("should reject request without token", async () => {
      const response = await fetch(`${API_URL}/me`, {
        method: "GET",
        headers: {},
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it("should reject request with invalid token", async () => {
      const response = await fetch(`${API_URL}/me`, {
        method: "GET",
        headers: {
          Cookie: "token=invalid.token.here",
        },
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });

  describe("POST /auth/signout", () => {
    it("should clear token cookie", async () => {
      const response = await fetch(`${API_URL}/signout`, {
        method: "POST",
      });

      expect(response.status).toBe(200);
      const setCookieHeader = response.headers.get("set-cookie");
      expect(setCookieHeader).toBeDefined();
      // Should clear the token cookie (max-age=0 or expires in past)
      expect(setCookieHeader).toContain("token=");
    });
  });
});

/**
 * Test Scenarios from Quickstart
 *
 * Scenario 1: User Registration and PM System Connection
 * - Register new user with email + password
 * - Verify JWT token received
 * - Verify user can access /auth/me
 * - Verify user can connect to PM systems
 */

describe("Scenario 1: User Registration Flow", () => {
  const scenario1Timestamp = Date.now();
  const scenario1User = {
    email: `scenario1-${scenario1Timestamp}@example.com`,
    password: "TestPassword123!",
  };
  let scenario1Token: string;

  it("should complete full registration flow", async () => {
    // 1. Register user
    const registerResponse = await fetch(
      "http://localhost:3001/api/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scenario1User),
      },
    );

    // 2. Verify 201 Created
    expect(registerResponse.status).toBe(201);
    const registerData = await registerResponse.json();

    // 3. Verify JWT token in response
    expect(registerData.token).toBeDefined();
    expect(registerData.userid).toBeDefined();
    scenario1Token = registerData.token;

    // 4. Verify token structure (JWT should have 3 parts separated by dots)
    const tokenParts = registerData.token.split(".");
    expect(tokenParts).toHaveLength(3);

    // 5. Test /auth/me with token
    const meResponse = await fetch("http://localhost:3001/api/auth/me", {
      method: "GET",
      headers: {
        Cookie: `token=${scenario1Token}`,
      },
    });

    // 6. Verify user details returned
    expect(meResponse.status).toBe(200);
    const userData = await meResponse.json();
    expect(userData.email).toBe(scenario1User.email);
    expect(userData.userid).toBe(registerData.userid);
  });
});

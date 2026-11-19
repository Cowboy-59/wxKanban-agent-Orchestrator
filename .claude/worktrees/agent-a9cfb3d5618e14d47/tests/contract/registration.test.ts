import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Contract tests for POST /api/auth/register endpoint
 * Validates API contract compliance and response structure
 *
 * Tests:
 * - Valid FREE tier registration
 * - Valid CONSULTANT tier registration
 * - Duplicate company name detection
 * - Duplicate billing email detection
 * - Duplicate admin email detection
 * - Invalid input validation
 */

const API_URL = process.env.API_URL || "http://localhost:3001";

// Test data
const validFreeRegistration = {
  companyName: `Test Company FREE ${Date.now()}`,
  billingEmail: `billing-free-${Date.now()}@test.com`,
  billingAddress: "123 Main Street, Anytown, ST 12345",
  billingCountry: "US",
  billingPhone: "+1 (555) 123-4567",
  subscriptionTier: "FREE",
  adminEmail: `admin-free-${Date.now()}@test.com`,
  adminPassword: "SecurePass123!@#",
  adminFirstName: "John",
  adminLastName: "Doe",
};

const validConsultantRegistration = {
  companyName: `Test Company CONSULTANT ${Date.now()}`,
  billingEmail: `billing-consultant-${Date.now()}@test.com`,
  billingAddress: "456 Oak Avenue, Somewhere, CA 54321",
  billingCountry: "US",
  billingPhone: "+1 (555) 987-6543",
  subscriptionTier: "CONSULTANT",
  adminEmail: `admin-consultant-${Date.now()}@test.com`,
  adminPassword: "SecurePass123!@#",
  adminFirstName: "Jane",
  adminLastName: "Smith",
};

describe("POST /api/auth/register - Contract Tests", () => {
  let registeredCompanyIds: string[] = [];

  afterAll(async () => {
    // Cleanup would happen here in a real test environment
    console.log(`Created companies: ${registeredCompanyIds.join(", ")}`);
  });

  describe("Valid Registrations", () => {
    it("should register a FREE tier company successfully", async () => {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validFreeRegistration),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data).toHaveProperty("success", true);
      expect(data).toHaveProperty("message");
      expect(data).toHaveProperty("company");
      expect(data).toHaveProperty("admin");
      expect(data).toHaveProperty("nextStep");

      // Validate company response
      expect(data.company).toHaveProperty("companyId");
      expect(data.company).toHaveProperty("companyName");
      expect(data.company).toHaveProperty("subscriptionTier", "FREE");
      expect(data.company).toHaveProperty("subscriptionStatus", "ACTIVE");
      expect(data.company).toHaveProperty("maxUsers", 5);
      expect(data.company).toHaveProperty("createdAt");

      // Validate admin response
      expect(data.admin).toHaveProperty("userId");
      expect(data.admin).toHaveProperty("email");
      expect(data.admin.email).toBe(validFreeRegistration.adminEmail);
      expect(data.admin).toHaveProperty("status", "PENDING");

      expect(data.nextStep).toBe("verify_email");

      registeredCompanyIds.push(data.company.companyId);
    });

    it("should register a CONSULTANT tier company successfully", async () => {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validConsultantRegistration),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.company.subscriptionTier).toBe("CONSULTANT");
      expect(data.company.maxUsers).toBeGreaterThan(5);
      expect(data.nextStep).toBe("verify_email");

      registeredCompanyIds.push(data.company.companyId);
    });
  });

  describe("Validation Errors", () => {
    it("should reject registration with invalid company name", async () => {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validFreeRegistration,
          companyName: "A", // Too short
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Validation");
    });

    it("should reject registration with invalid email format", async () => {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validFreeRegistration,
          billingEmail: "not-an-email",
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty("error");
    });

    it("should reject registration with invalid country code", async () => {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validFreeRegistration,
          billingCountry: "USA", // Should be 2-letter code
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty("error");
    });

    it("should reject registration with weak password", async () => {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validFreeRegistration,
          adminPassword: "weak", // Too short, no special chars
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty("error");
    });

    it("should reject registration with missing required fields", async () => {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyName: "Test Company",
          // Missing other required fields
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty("error");
    });
  });

  describe("Duplicate Detection", () => {
    it("should reject duplicate company name", async () => {
      // First registration
      const firstResponse = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validFreeRegistration,
          companyName: `Unique Company ${Date.now()}`,
          billingEmail: `billing1-${Date.now()}@test.com`,
          adminEmail: `admin1-${Date.now()}@test.com`,
        }),
      });

      expect(firstResponse.status).toBe(201);
      const firstData = await firstResponse.json();
      const companyName = firstData.company.companyName;

      // Second registration with same company name
      const secondResponse = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validFreeRegistration,
          companyName,
          billingEmail: `billing2-${Date.now()}@test.com`,
          adminEmail: `admin2-${Date.now()}@test.com`,
        }),
      });

      expect(secondResponse.status).toBe(409);
      const secondData = await secondResponse.json();
      expect(secondData.error).toContain("already registered");
    });

    it("should reject duplicate billing email", async () => {
      const uniqueEmail = `billing-${Date.now()}@test.com`;

      // First registration
      const firstResponse = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validFreeRegistration,
          companyName: `Company 1 ${Date.now()}`,
          billingEmail: uniqueEmail,
          adminEmail: `admin1-${Date.now()}@test.com`,
        }),
      });

      expect(firstResponse.status).toBe(201);

      // Second registration with same billing email
      const secondResponse = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validFreeRegistration,
          companyName: `Company 2 ${Date.now()}`,
          billingEmail: uniqueEmail,
          adminEmail: `admin2-${Date.now()}@test.com`,
        }),
      });

      expect(secondResponse.status).toBe(409);
      const secondData = await secondResponse.json();
      expect(secondData.error).toContain("already registered");
    });

    it("should reject duplicate admin email", async () => {
      const uniqueEmail = `admin-${Date.now()}@test.com`;

      // First registration
      const firstResponse = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validFreeRegistration,
          companyName: `Company A ${Date.now()}`,
          billingEmail: `billing-a-${Date.now()}@test.com`,
          adminEmail: uniqueEmail,
        }),
      });

      expect(firstResponse.status).toBe(201);

      // Second registration with same admin email
      const secondResponse = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validFreeRegistration,
          companyName: `Company B ${Date.now()}`,
          billingEmail: `billing-b-${Date.now()}@test.com`,
          adminEmail: uniqueEmail,
        }),
      });

      expect(secondResponse.status).toBe(409);
      const secondData = await secondResponse.json();
      expect(secondData.error).toContain("already registered");
    });
  });

  describe("Response Structure", () => {
    it("should return correct response structure for successful registration", async () => {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validFreeRegistration,
          companyName: `Structure Test ${Date.now()}`,
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      // Top-level properties
      expect(data).toHaveProperty("success");
      expect(data).toHaveProperty("message");
      expect(data).toHaveProperty("company");
      expect(data).toHaveProperty("admin");
      expect(data).toHaveProperty("nextStep");

      // Company object structure
      expect(typeof data.company.companyId).toBe("string");
      expect(typeof data.company.companyName).toBe("string");
      expect(["FREE", "CONSULTANT", "ENTERPRISE"]).toContain(
        data.company.subscriptionTier
      );
      expect(["ACTIVE", "PENDING"]).toContain(data.company.subscriptionStatus);
      expect(typeof data.company.maxUsers).toBe("number");
      expect(data.company.maxUsers).toBeGreaterThan(0);

      // Admin object structure
      expect(typeof data.admin.userId).toBe("string");
      expect(typeof data.admin.email).toBe("string");
      expect(["PENDING", "ACTIVE"]).toContain(data.admin.status);

      // Next step should be verify_email
      expect(data.nextStep).toBe("verify_email");

      registeredCompanyIds.push(data.company.companyId);
    });
  });
});

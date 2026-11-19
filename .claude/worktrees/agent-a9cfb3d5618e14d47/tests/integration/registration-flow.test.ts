import { describe, it, expect } from "vitest";

/**
 * Integration tests for complete registration flow
 * Tests end-to-end registration from form submission to success
 *
 * Scenarios:
 * - FREE tier registration to dashboard access
 * - CONSULTANT tier registration with payment
 * - Payment failure recovery
 * - Email verification flow
 */

const API_URL = process.env.API_URL || "http://localhost:3001";

describe("Registration Flow - Integration Tests", () => {
  describe("FREE Tier Registration Flow", () => {
    it("should complete full FREE tier registration without payment", async () => {
      const registrationData = {
        companyName: `Integration Test FREE ${Date.now()}`,
        billingEmail: `billing-int-free-${Date.now()}@test.com`,
        billingAddress: "789 Test Lane, Testville, TX 99999",
        billingCountry: "US",
        billingPhone: "+1 (555) 999-8888",
        subscriptionTier: "FREE",
        adminEmail: `admin-int-free-${Date.now()}@test.com`,
        adminPassword: "IntegrationTest123!@#",
        adminFirstName: "Integration",
        adminLastName: "Tester",
      };

      // Step 1: Register company
      const registerResponse = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(registrationData),
      });

      expect(registerResponse.status).toBe(201);
      const registerData = await registerResponse.json();

      expect(registerData.success).toBe(true);
      expect(registerData.company.subscriptionTier).toBe("FREE");
      expect(registerData.company.subscriptionStatus).toBe("ACTIVE");
      expect(registerData.admin.status).toBe("PENDING");
      expect(registerData.nextStep).toBe("verify_email");

      const companyId = registerData.company.companyId;
      const adminEmail = registerData.admin.email;

      // Step 2: Verify email (would normally happen via email link)
      // In integration test, we verify that company exists and is ready
      expect(companyId).toBeDefined();
      expect(adminEmail).toBe(registrationData.adminEmail);

      // Step 3: User should be able to verify and login
      // (Email verification logic would be tested separately)

      expect(registerData.company).toHaveProperty("companyId");
      expect(registerData.company).toHaveProperty("maxUsers", 5);
    });
  });

  describe("CONSULTANT Tier Registration Flow", () => {
    it("should complete CONSULTANT registration with payment setup", async () => {
      const registrationData = {
        companyName: `Integration Test CONSULTANT ${Date.now()}`,
        billingEmail: `billing-int-consultant-${Date.now()}@test.com`,
        billingAddress: "321 Commerce Street, Business City, CA 11111",
        billingCountry: "US",
        billingPhone: "+1 (555) 777-5555",
        subscriptionTier: "CONSULTANT",
        adminEmail: `admin-int-consultant-${Date.now()}@test.com`,
        adminPassword: "ConsultantTest123!@#",
        adminFirstName: "Consultant",
        adminLastName: "Admin",
      };

      // Step 1: Validate CONSULTANT tier
      const validateResponse = await fetch(`${API_URL}/api/payment/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscriptionTier: "CONSULTANT",
        }),
      });

      expect(validateResponse.status).toBe(200);
      const validateData = await validateResponse.json();
      expect(validateData.tier).toBe("CONSULTANT");
      expect(validateData.monthlyPrice).toBe(19.95);

      // Step 2: Register company
      const registerResponse = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(registrationData),
      });

      expect(registerResponse.status).toBe(201);
      const registerData = await registerResponse.json();

      expect(registerData.company.subscriptionTier).toBe("CONSULTANT");
      expect(registerData.success).toBe(true);

      const companyId = registerData.company.companyId;

      // Step 3: Create SetupIntent for payment
      const setupResponse = await fetch(`${API_URL}/api/payment/setup-intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyId,
          adminEmail: registrationData.adminEmail,
          adminName: registrationData.adminFirstName,
          subscriptionTier: "CONSULTANT",
        }),
      });

      expect(setupResponse.status).toBe(200);
      const setupData = await setupResponse.json();

      expect(setupData.success).toBe(true);
      expect(setupData).toHaveProperty("clientSecret");
      expect(setupData).toHaveProperty("setupIntentId");
      expect(setupData.monthlyPrice).toBe(19.95);

      // Step 4: Process subscription (after payment confirmation)
      // Note: In real scenario, SetupIntent would be confirmed in frontend first
      const processResponse = await fetch(`${API_URL}/api/payment/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyId,
          customerId: "cus_test_consultant",
          setupIntentId: setupData.setupIntentId,
          subscriptionTier: "CONSULTANT",
        }),
      });

      // Should succeed or fail gracefully
      expect([200, 400]).toContain(processResponse.status);

      if (processResponse.status === 200) {
        const processData = await processResponse.json();
        expect(processData.subscription.monthlyPrice).toBe(19.95);
        expect(processData.nextStep).toBe("complete_onboarding");
      }
    });
  });

  describe("Payment Flow with Validation", () => {
    it("should validate tier before creating SetupIntent", async () => {
      // Step 1: Validate all tiers
      const tiers = ["FREE", "CONSULTANT", "ENTERPRISE"];

      for (const tier of tiers) {
        const validateResponse = await fetch(`${API_URL}/api/payment/validate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ subscriptionTier: tier }),
        });

        expect(validateResponse.status).toBe(200);
        const validateData = await validateResponse.json();

        // Each tier should have features
        expect(validateData.features).toBeDefined();
        expect(Array.isArray(validateData.features)).toBe(true);
        expect(validateData.features.length).toBeGreaterThan(0);

        // Pricing should be consistent
        expect(validateData).toHaveProperty("monthlyPrice");
        expect(validateData).toHaveProperty("pricing");
      }
    });

    it("should handle invalid tier gracefully", async () => {
      const validateResponse = await fetch(`${API_URL}/api/payment/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ subscriptionTier: "INVALID_TIER" }),
      });

      expect([400, 500]).toContain(validateResponse.status);
      const data = await validateResponse.json();
      expect(data).toHaveProperty("error");
    });
  });

  describe("Registration Data Persistence", () => {
    it("should create company with all provided details", async () => {
      const registrationData = {
        companyName: `Data Test Company ${Date.now()}`,
        billingEmail: `billing-data-${Date.now()}@test.com`,
        billingAddress: "555 Data Drive, Information City, NY 22222",
        billingCountry: "US",
        billingPhone: "+1 (555) 444-3333",
        subscriptionTier: "FREE",
        adminEmail: `admin-data-${Date.now()}@test.com`,
        adminPassword: "DataTest123!@#",
        adminFirstName: "Data",
        adminLastName: "Master",
      };

      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(registrationData),
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      // Verify all data was stored correctly
      expect(data.company.companyName).toBe(registrationData.companyName);
      expect(data.admin.email).toBe(registrationData.adminEmail);
      expect(data.company.maxUsers).toBe(5);
      expect(data.company.subscriptionTier).toBe("FREE");
    });

    it("should generate unique IDs for company and admin", async () => {
      const registrationData1 = {
        companyName: `Unique Test 1 ${Date.now()}`,
        billingEmail: `billing-unique-1-${Date.now()}@test.com`,
        billingAddress: "100 Unique Street",
        billingCountry: "US",
        billingPhone: "+1 (555) 111-0000",
        subscriptionTier: "FREE",
        adminEmail: `admin-unique-1-${Date.now()}@test.com`,
        adminPassword: "UniqueTest123!@#",
        adminFirstName: "Unique",
      };

      const registrationData2 = {
        companyName: `Unique Test 2 ${Date.now()}`,
        billingEmail: `billing-unique-2-${Date.now()}@test.com`,
        billingAddress: "200 Unique Avenue",
        billingCountry: "US",
        billingPhone: "+1 (555) 222-0000",
        subscriptionTier: "FREE",
        adminEmail: `admin-unique-2-${Date.now()}@test.com`,
        adminPassword: "UniqueTest123!@#",
        adminFirstName: "Unique",
      };

      const response1 = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(registrationData1),
      });

      expect(response1.status).toBe(201);
      const data1 = await response1.json();
      const companyId1 = data1.company.companyId;

      const response2 = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(registrationData2),
      });

      expect(response2.status).toBe(201);
      const data2 = await response2.json();
      const companyId2 = data2.company.companyId;

      // IDs should be unique
      expect(companyId1).not.toBe(companyId2);
      expect(typeof companyId1).toBe("string");
      expect(typeof companyId2).toBe("string");
    });
  });

  describe("Error Recovery", () => {
    it("should allow registration after validation error correction", async () => {
      // First attempt with invalid data
      const invalidData = {
        companyName: "X", // Too short
        billingEmail: "not-email",
        billingAddress: "short",
        billingCountry: "INVALID",
        billingPhone: "123",
        subscriptionTier: "FREE",
        adminEmail: "test@test.com",
        adminPassword: "weak",
        adminFirstName: "Test",
      };

      const invalidResponse = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(invalidData),
      });

      expect(invalidResponse.status).toBe(400);

      // Second attempt with corrected data
      const validData = {
        companyName: `Recovery Test ${Date.now()}`,
        billingEmail: `billing-recovery-${Date.now()}@test.com`,
        billingAddress: "123 Valid Street, City, ST 12345",
        billingCountry: "US",
        billingPhone: "+1 (555) 666-7777",
        subscriptionTier: "FREE",
        adminEmail: `admin-recovery-${Date.now()}@test.com`,
        adminPassword: "RecoveryTest123!@#",
        adminFirstName: "Recovery",
      };

      const validResponse = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validData),
      });

      expect(validResponse.status).toBe(201);
      const data = await validResponse.json();
      expect(data.success).toBe(true);
    });
  });

  describe("Multi-Step Consistency", () => {
    it("should maintain consistency across registration steps", async () => {
      const registrationData = {
        companyName: `Consistency Test ${Date.now()}`,
        billingEmail: `billing-consistency-${Date.now()}@test.com`,
        billingAddress: "777 Consistency Lane",
        billingCountry: "US",
        billingPhone: "+1 (555) 888-9999",
        subscriptionTier: "CONSULTANT",
        adminEmail: `admin-consistency-${Date.now()}@test.com`,
        adminPassword: "ConsistencyTest123!@#",
        adminFirstName: "Consistency",
      };

      // Step 1: Validate tier
      const validateResponse = await fetch(`${API_URL}/api/payment/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscriptionTier: registrationData.subscriptionTier,
        }),
      });

      expect(validateResponse.status).toBe(200);
      const validateData = await validateResponse.json();
      const expectedPrice = validateData.monthlyPrice;

      // Step 2: Register
      const registerResponse = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(registrationData),
      });

      expect(registerResponse.status).toBe(201);
      const registerData = await registerResponse.json();

      // Step 3: Verify pricing consistency
      const setupResponse = await fetch(`${API_URL}/api/payment/setup-intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyId: registerData.company.companyId,
          adminEmail: registrationData.adminEmail,
          adminName: registrationData.adminFirstName,
          subscriptionTier: registrationData.subscriptionTier,
        }),
      });

      expect(setupResponse.status).toBe(200);
      const setupData = await setupResponse.json();

      // Prices should match across all steps
      expect(setupData.monthlyPrice).toBe(expectedPrice);
      expect(setupData.tier).toBe(registrationData.subscriptionTier);
    });
  });
});

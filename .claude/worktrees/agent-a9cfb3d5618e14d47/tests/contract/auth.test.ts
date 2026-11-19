import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../src/server/app.js";

describe("Auth API Contract Tests", () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  const uniqueEmail = (tag: string) =>
    `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@contract-test.local`;

  describe("POST /api/auth/register", () => {
    it("registers a new company + admin user", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          companyName: `Contract Co ${Date.now()}`,
          adminEmail: uniqueEmail("reg"),
          adminPassword: "SecurePass123!",
          adminFirstName: "Contract",
          subscriptionTier: "FREE",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty("userid");
      expect(response.body).toHaveProperty("companyid");
      expect(response.body.usertype).toBe("ADMIN");
    });

    it("rejects duplicate email registration", async () => {
      const email = uniqueEmail("dup");
      await request(app)
        .post("/api/auth/register")
        .send({
          companyName: `Dup Co A ${Date.now()}`,
          adminEmail: email,
          adminPassword: "SecurePass123!",
        });

      const response = await request(app)
        .post("/api/auth/register")
        .send({
          companyName: `Dup Co B ${Date.now()}`,
          adminEmail: email,
          adminPassword: "SecurePass123!",
        });

      expect(response.status).toBe(409);
    });

    it("validates required fields", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          companyName: "",
          adminEmail: "invalid-email",
          adminPassword: "123",
        });

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/auth/signin", () => {
    it("authenticates valid credentials", async () => {
      const email = uniqueEmail("signin");
      await request(app)
        .post("/api/auth/register")
        .send({
          companyName: `Signin Co ${Date.now()}`,
          adminEmail: email,
          adminPassword: "SecurePass123!",
        });

      const response = await request(app)
        .post("/api/auth/signin")
        .send({ email, password: "SecurePass123!" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("token");
      expect(response.body).toHaveProperty("user");
    });

    it("rejects invalid credentials", async () => {
      const response = await request(app)
        .post("/api/auth/signin")
        .send({
          email: "nonexistent@contract-test.local",
          password: "WrongPassword123!",
        });

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/auth/signout", () => {
    it("clears the auth cookie", async () => {
      const response = await request(app).post("/api/auth/signout");
      expect(response.status).toBe(200);
      expect(response.headers["set-cookie"]).toBeDefined();
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns current user when authenticated", async () => {
      const email = uniqueEmail("me");
      await request(app)
        .post("/api/auth/register")
        .send({
          companyName: `Me Co ${Date.now()}`,
          adminEmail: email,
          adminPassword: "SecurePass123!",
        });

      const signinRes = await request(app)
        .post("/api/auth/signin")
        .send({ email, password: "SecurePass123!" });

      const token = signinRes.body.token;

      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("email", email);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app).get("/api/auth/me");
      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/auth/forgot-password", () => {
    it("returns a generic success for a known email", async () => {
      const email = uniqueEmail("fp-known");
      await request(app)
        .post("/api/auth/register")
        .send({
          companyName: `FP Co ${Date.now()}`,
          adminEmail: email,
          adminPassword: "SecurePass123!",
        });

      const response = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(typeof response.body.message).toBe("string");
    });

    it("returns the same generic success for an unknown email (no account enumeration)", async () => {
      const response = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: `unknown-${Date.now()}@contract-test.local` });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("rejects invalid email format", async () => {
      const response = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "not-an-email" });

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/auth/reset-password", () => {
    it("rejects a malformed token", async () => {
      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({ token: "not-a-jwt", newPassword: "BrandNewPass123!" });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("error");
    });

    it("rejects a short password", async () => {
      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({ token: "anything", newPassword: "123" });

      expect(response.status).toBe(400);
    });

    it("rejects a token with the wrong purpose", async () => {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) return;
      const jwt = await import("jsonwebtoken");
      const badToken = jwt.default.sign(
        { userid: "00000000-0000-0000-0000-000000000000", purpose: "email-verification" },
        jwtSecret,
        { expiresIn: "1h" },
      );

      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({ token: badToken, newPassword: "BrandNewPass123!" });

      expect(response.status).toBe(401);
    });
  });
});

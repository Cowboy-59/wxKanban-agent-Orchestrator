import jwt, { JwtPayload } from "jsonwebtoken";
import { config } from "../config.js";

export interface TokenPayload extends JwtPayload {
  userid: string;
  email: string;
  companyid?: string;
  usertype?: string;
  billingplan?: string;
  subscriptionstatus?: string;
  maxusers?: number;
}

export interface CompanyTokenContext {
  companyid: string;
  usertype: string;
  billingplan: string;
  subscriptionstatus: string;
  maxusers: number;
}

/**
 * Sign a JWT token with 24-hour expiry.
 * Pass companyContext to embed company + role data for admin dashboard.
 * Pass fallbackUsertype for users without a company who still have a role.
 */
export function signToken(
  userid: string,
  email: string,
  companyContext?: CompanyTokenContext,
  fallbackUsertype?: string,
): string {
  const payload: TokenPayload = {
    userid,
    email,
    // Embed usertype from company context, or fallback for no-company users
    ...(!companyContext && fallbackUsertype ? { usertype: fallbackUsertype } : {}),
    ...companyContext,
  };

  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: "24h",
    algorithm: "HS256",
  });
}

/**
 * Verify a JWT token
 */
export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as TokenPayload;

    return decoded;
  } catch (error) {
    throw new Error(
      `Token verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Decode a JWT token without verification (use with caution)
 */
export function decodeToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.decode(token) as TokenPayload | null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Extract token from Authorization header
 */
export function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7); // Remove 'Bearer ' prefix
}

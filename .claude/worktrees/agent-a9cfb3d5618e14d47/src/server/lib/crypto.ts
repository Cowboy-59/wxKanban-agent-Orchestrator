import crypto from "crypto";

const algorithm = "aes-256-gcm";

export function encryptToken(token: string, encryptionKey: string): string {
  try {
    // Generate a random IV
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM

    // Create cipher
    const cipher = crypto.createCipheriv(
      algorithm,
      Buffer.from(encryptionKey, "utf-8"),
      iv,
    );

    // Encrypt the token
    let encrypted = cipher.update(token, "utf-8", "hex");
    encrypted += cipher.final("hex");

    // Get the authentication tag
    const authTag = cipher.getAuthTag();

    // Combine IV + authTag + encrypted data
    const combined =
      iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted;

    return combined;
  } catch (error) {
    throw new Error(
      `Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export function decryptToken(
  encryptedData: string,
  encryptionKey: string,
): string {
  try {
    // Split the combined data
    const parts = encryptedData.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format");
    }

    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];

    // Create decipher
    const decipher = crypto.createDecipheriv(
      algorithm,
      Buffer.from(encryptionKey, "utf-8"),
      iv,
    );
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(encrypted, "hex", "utf-8");
    decrypted += decipher.final("utf-8");

    return decrypted;
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export function hashPassword(
  password: string,
  saltRounds: number = 12,
): string {
  // Using native Node.js crypto instead of bcryptjs for compatibility
  // In production, use bcryptjs or argon2
  const salt = crypto.randomBytes(16);
  const iterations = Math.pow(2, saltRounds);
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha256");
  return salt.toString("hex") + ":" + hash.toString("hex") + ":" + iterations;
}

export function verifyPassword(password: string, hash: string): boolean {
  try {
    const parts = hash.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid hash format");
    }

    const salt = Buffer.from(parts[0], "hex");
    const storedHash = parts[1];
    const iterations = parseInt(parts[2], 10);

    const computedHash = crypto.pbkdf2Sync(
      password,
      salt,
      iterations,
      64,
      "sha256",
    );

    return computedHash.toString("hex") === storedHash;
  } catch (error) {
    return false;
  }
}

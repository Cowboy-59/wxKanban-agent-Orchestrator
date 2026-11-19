import { Redis } from "ioredis";
import { logger } from "./logger";

/**
 * Redis client for job queue and caching
 * Used by BullMQ for email queue processing and token blacklisting
 *
 * Connection pooling and retry strategy configured for production reliability
 */

// Global Redis instance
let redisClient: Redis | null = null;

/**
 * Initialize Redis connection
 */
export function initializeRedis(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  try {
    redisClient = new Redis(redisUrl, {
      // Connection settings
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,

      // Reconnection strategy
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },

      // Connection pool settings
      lazyConnect: false,
      keepAlive: 30000,

      // Command timeout
      commandTimeout: 5000,

      // TLS for production
      tls:
        process.env.NODE_ENV === "production"
          ? {
              rejectUnauthorized: true,
            }
          : undefined,
    });

    // Event handlers
    redisClient.on("connect", () => {
      logger.info("Redis connected");
    });

    redisClient.on("error", (error) => {
      logger.error({ error }, "Redis connection error");
    });

    redisClient.on("reconnecting", () => {
      logger.warn("Redis reconnecting");
    });

    redisClient.on("ready", () => {
      logger.info("Redis ready");
    });

    return redisClient;
  } catch (error) {
    logger.error({ error }, "Failed to initialize Redis");
    throw error;
  }
}

/**
 * Get Redis client instance
 */
export function getRedis(): Redis {
  if (!redisClient) {
    return initializeRedis();
  }
  return redisClient;
}

/**
 * Health check for Redis
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const redis = getRedis();
    const pong = await redis.ping();
    return pong === "PONG";
  } catch (error) {
    logger.error({ error }, "Redis health check failed");
    return false;
  }
}

/**
 * Store value in Redis with optional expiry
 */
export async function setRedisValue(
  key: string,
  value: string,
  expirySeconds?: number
): Promise<void> {
  try {
    const redis = getRedis();

    if (expirySeconds) {
      await redis.setex(key, expirySeconds, value);
    } else {
      await redis.set(key, value);
    }

    logger.debug({ key, expirySeconds }, "Redis value set");
  } catch (error) {
    logger.error({ error, key }, "Failed to set Redis value");
    throw error;
  }
}

/**
 * Get value from Redis
 */
export async function getRedisValue(key: string): Promise<string | null> {
  try {
    const redis = getRedis();
    const value = await redis.get(key);
    return value;
  } catch (error) {
    logger.error({ error, key }, "Failed to get Redis value");
    throw error;
  }
}

/**
 * Delete value from Redis
 */
export async function deleteRedisValue(key: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(key);
    logger.debug({ key }, "Redis value deleted");
  } catch (error) {
    logger.error({ error, key }, "Failed to delete Redis value");
    throw error;
  }
}

/**
 * Check if key exists in Redis
 */
export async function redisKeyExists(key: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const exists = await redis.exists(key);
    return exists === 1;
  } catch (error) {
    logger.error({ error, key }, "Failed to check Redis key existence");
    throw error;
  }
}

/**
 * Store JSON in Redis
 */
export async function setRedisJson<T extends Record<string, unknown>>(
  key: string,
  value: T,
  expirySeconds?: number
): Promise<void> {
  try {
    const jsonString = JSON.stringify(value);
    await setRedisValue(key, jsonString, expirySeconds);
  } catch (error) {
    logger.error({ error, key }, "Failed to set Redis JSON");
    throw error;
  }
}

/**
 * Get JSON from Redis
 */
export async function getRedisJson<T extends Record<string, unknown>>(
  key: string
): Promise<T | null> {
  try {
    const value = await getRedisValue(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (error) {
    logger.error({ error, key }, "Failed to get Redis JSON");
    throw error;
  }
}

/**
 * Token blacklist operations for logout/revocation
 */
export const tokenBlacklist = {
  /**
   * Add token to blacklist (revoked tokens)
   */
  async add(token: string, expirySeconds: number): Promise<void> {
    const key = `blacklist:${token}`;
    await setRedisValue(key, "revoked", expirySeconds);
    logger.debug({ token: token.substring(0, 20) }, "Token blacklisted");
  },

  /**
   * Check if token is blacklisted
   */
  async isBlacklisted(token: string): Promise<boolean> {
    const key = `blacklist:${token}`;
    return await redisKeyExists(key);
  },

  /**
   * Remove token from blacklist
   */
  async remove(token: string): Promise<void> {
    const key = `blacklist:${token}`;
    await deleteRedisValue(key);
  },
};

/**
 * Session cache operations
 */
export const sessionCache = {
  /**
   * Store session in cache
   */
  async set(
    sessionId: string,
    sessionData: Record<string, unknown>,
    expirySeconds: number
  ): Promise<void> {
    const key = `session:${sessionId}`;
    await setRedisJson(key, sessionData, expirySeconds);
  },

  /**
   * Get session from cache
   */
  async get(sessionId: string): Promise<Record<string, unknown> | null> {
    const key = `session:${sessionId}`;
    return await getRedisJson(key);
  },

  /**
   * Delete session from cache
   */
  async delete(sessionId: string): Promise<void> {
    const key = `session:${sessionId}`;
    await deleteRedisValue(key);
  },
};

/**
 * Rate limiting operations
 */
export const rateLimit = {
  /**
   * Increment counter for rate limiting
   */
  async increment(
    key: string,
    windowSeconds: number = 60
  ): Promise<number> {
    const redis = getRedis();
    const limiterKey = `ratelimit:${key}`;

    const count = await redis.incr(limiterKey);

    // Set expiry on first increment
    if (count === 1) {
      await redis.expire(limiterKey, windowSeconds);
    }

    return count;
  },

  /**
   * Check if rate limit exceeded
   */
  async isExceeded(
    key: string,
    limit: number,
    windowSeconds: number = 60
  ): Promise<boolean> {
    const count = await rateLimit.increment(key, windowSeconds);
    return count > limit;
  },

  /**
   * Reset counter
   */
  async reset(key: string): Promise<void> {
    const limiterKey = `ratelimit:${key}`;
    await deleteRedisValue(limiterKey);
  },
};

/**
 * Cleanup and disconnect
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      redisClient = null;
      logger.info("Redis disconnected");
    } catch (error) {
      logger.error({ error }, "Error disconnecting Redis");
    }
  }
}

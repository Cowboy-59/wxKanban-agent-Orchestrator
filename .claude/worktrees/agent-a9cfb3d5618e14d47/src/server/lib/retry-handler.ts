/**
 * Retry Handler for Transient Errors
 *
 * Implements automatic retry logic for compliance checks and other transient operations.
 * Only retries for transient errors (network, temporary locks), not permanent failures.
 *
 * Implements T092
 */

import { logger } from '~/lib/logger';

/**
 * Retry options configuration
 */
export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
}

/**
 * Default retry options
 */
const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  // Only retry on transient errors, not permanent failures
  retryableErrors: [
    'ECONNREFUSED', // Connection refused
    'ECONNRESET', // Connection reset
    'ETIMEDOUT', // Timeout
    'EHOSTUNREACH', // Host unreachable
    'ENETUNREACH', // Network unreachable
    'ERR_HTTP2_STREAM_RESET', // HTTP/2 stream reset
    'ENOTFOUND', // DNS not found (temporary)
  ],
};

/**
 * Check if error is retryable (transient)
 * Permanent errors (validation, auth, not found) should NOT be retried
 */
function isRetryableError(
  error: any,
  retryableErrors: string[] = DEFAULT_OPTIONS.retryableErrors || []
): boolean {
  if (!error) return false;

  // Check error code
  if (error.code && retryableErrors.includes(error.code)) {
    return true;
  }

  // Check error message
  const errorMessage = error.message?.toLowerCase() || '';
  if (retryableErrors.some((code) => errorMessage.includes(code))) {
    return true;
  }

  // Network-related status codes
  if (error.statusCode) {
    // 408 Request Timeout, 429 Too Many Requests, 500 Internal Error, 502 Bad Gateway, 503 Unavailable, 504 Gateway Timeout
    const retryableStatuses = [408, 429, 500, 502, 503, 504];
    if (retryableStatuses.includes(error.statusCode)) {
      return true;
    }
  }

  // Don't retry permanent failures
  const permanentPatterns = [
    'validation',
    'unauthorized',
    'forbidden',
    'not found',
    'conflict',
    'invalid',
  ];

  if (
    permanentPatterns.some((pattern) =>
      errorMessage.includes(pattern.toLowerCase())
    )
  ) {
    return false;
  }

  return false;
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number
): number {
  const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  // Add jitter (±10%)
  const jitter = cappedDelay * 0.1;
  const jitterAmount = Math.random() * jitter * 2 - jitter;
  return Math.max(0, cappedDelay + jitterAmount);
}

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Retry handler: Automatically retries failed operations
 * Only retries on transient errors, fails immediately on permanent errors
 *
 * @param operation - Async function to retry
 * @param operationName - Name of operation (for logging)
 * @param options - Retry configuration
 * @returns Result of operation on success, throws on failure after all retries
 *
 * Example:
 * ```
 * const result = await retryOperation(
 *   () => complianceEngine.validateDutyAssignment(...),
 *   'Validate duty assignment',
 *   { maxAttempts: 3 }
 * );
 * ```
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  operationName: string = 'Operation',
  options: RetryOptions = {}
): Promise<T> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const {
    maxAttempts = 3,
    initialDelayMs = 100,
    maxDelayMs = 5000,
    backoffMultiplier = 2,
    retryableErrors = DEFAULT_OPTIONS.retryableErrors,
  } = mergedOptions;

  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!isRetryableError(error, retryableErrors)) {
        // Permanent error, don't retry
        logger.warn(
          { operation: operationName, error: getErrorMessage(error) },
          'Permanent error, not retrying'
        );
        throw error;
      }

      // Retryable error but exhausted attempts
      if (attempt === maxAttempts) {
        logger.error(
          {
            operation: operationName,
            error: getErrorMessage(error),
            attempts: attempt,
          },
          'All retry attempts failed'
        );
        throw error;
      }

      // Calculate backoff and retry
      const delayMs = calculateDelay(
        attempt,
        initialDelayMs,
        maxDelayMs,
        backoffMultiplier
      );

      logger.debug(
        {
          operation: operationName,
          attempt,
          maxAttempts,
          delayMs,
          error: getErrorMessage(error),
        },
        'Retrying operation after transient error'
      );

      await sleep(delayMs);
    }
  }

  // Should not reach here, but throw last error as fallback
  throw lastError;
}

/**
 * Retry handler for synchronous operations (rare use case)
 * Useful for operations that can't be async but need retry logic
 */
export function retrySyncOperation<T>(
  operation: () => T,
  operationName: string = 'Operation',
  options: RetryOptions = {}
): T {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const {
    maxAttempts = 3,
    retryableErrors = DEFAULT_OPTIONS.retryableErrors,
  } = mergedOptions;

  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return operation();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error, retryableErrors)) {
        throw error;
      }

      if (attempt === maxAttempts) {
        throw error;
      }

      // For sync operations, we can't delay, so just continue
      logger.debug(
        {
          operation: operationName,
          attempt,
          error: getErrorMessage(error),
        },
        'Sync operation failed, attempting retry'
      );
    }
  }

  throw lastError;
}

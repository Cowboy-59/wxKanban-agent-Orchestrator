/**
 * Performance Profiler Utilities
 *
 * Implements performance monitoring and profiling for API endpoints and operations.
 * Tracks response times against SLAs and provides structured performance metrics.
 *
 * Implements T102: Profile API response times (validation < 200ms, assignment < 1s)
 */

import { logger } from '~/lib/logger';

/**
 * Performance SLA targets for different operation types
 */
export const PERFORMANCE_SLA = {
  // Compliance validation should be fast (< 200ms)
  COMPLIANCE_VALIDATION: 200,
  // Duty assignment includes database write (< 1s)
  DUTY_ASSIGNMENT: 1000,
  // Duty listing (< 500ms)
  DUTY_LISTING: 500,
  // Task routing decision (< 300ms)
  TASK_ROUTING: 300,
  // Compliance override audit (< 500ms)
  AUDIT_LISTING: 500,
} as const;

/**
 * Performance metric for an operation
 */
export interface PerformanceMetric {
  operationName: string;
  durationMs: number;
  slaMs: number;
  isSlaViolation: boolean;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Profile an async operation and record performance metrics
 * @param operation Async function to profile
 * @param operationName Name of the operation (for logging)
 * @param slaMs SLA target in milliseconds
 * @param metadata Optional metadata to include in logs
 * @returns Result of the operation
 */
export async function profileOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  slaMs: number,
  metadata?: Record<string, unknown>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await operation();
    const durationMs = Date.now() - startTime;
    const isSlaViolation = durationMs > slaMs;

    // Log at warn level if SLA violated, info otherwise
    const logLevel = isSlaViolation ? 'warn' : 'debug';
    logger[logLevel](
      {
        operation: operationName,
        durationMs,
        slaMs,
        violated: isSlaViolation,
        ...metadata,
      },
      isSlaViolation
        ? 'Operation exceeded SLA'
        : 'Operation completed within SLA'
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error(
      {
        operation: operationName,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
        ...metadata,
      },
      'Operation failed'
    );
    throw error;
  }
}

/**
 * Middleware for profiling Express endpoint performance
 * Attaches performance tracking to response
 */
export function performanceProfilerMiddleware(
  _req: any,
  res: any,
  next: any
): void {
  const startTime = Date.now();

  // Override res.json to capture response time
  const originalJson = res.json.bind(res);
  res.json = function (data: any) {
    const durationMs = Date.now() - startTime;
    const endpoint = `${_req.method} ${_req.path}`;
    const statusCode = res.statusCode;

    // Log performance metrics
    logger.debug(
      {
        endpoint,
        statusCode,
        durationMs,
        method: _req.method,
        path: _req.path,
      },
      'API endpoint performance'
    );

    // Attach performance header
    res.set('X-Response-Time', `${durationMs}ms`);
    return originalJson(data);
  };

  next();
}

/**
 * Batch operation performance tracking
 * Track multiple operations and report aggregate metrics
 */
export class PerformanceBatch {
  private operations: PerformanceMetric[] = [];
  private batchName: string;

  constructor(batchName: string) {
    this.batchName = batchName;
  }

  /**
   * Record a single operation's performance
   */
  record(metric: PerformanceMetric): void {
    this.operations.push(metric);
  }

  /**
   * Get aggregate statistics
   */
  getStats() {
    if (this.operations.length === 0) {
      return {
        batchName: this.batchName,
        count: 0,
        avgDurationMs: 0,
        minDurationMs: 0,
        maxDurationMs: 0,
        slaViolations: 0,
        slaViolationRate: 0,
      };
    }

    const durations = this.operations.map((m) => m.durationMs);
    const slaViolations = this.operations.filter((m) => m.isSlaViolation).length;

    return {
      batchName: this.batchName,
      count: this.operations.length,
      avgDurationMs: Math.round(
        durations.reduce((a, b) => a + b, 0) / durations.length
      ),
      minDurationMs: Math.min(...durations),
      maxDurationMs: Math.max(...durations),
      slaViolations,
      slaViolationRate: (slaViolations / this.operations.length) * 100,
    };
  }

  /**
   * Log batch statistics
   */
  logStats(): void {
    const stats = this.getStats();
    logger.info(stats, `Performance batch complete: ${this.batchName}`);
  }
}

/**
 * Measure and track database query performance
 */
export class QueryProfiler {
  private queryMetrics: PerformanceMetric[] = [];

  /**
   * Profile a database query
   */
  async profileQuery<T>(
    query: () => Promise<T>,
    queryName: string,
    slaMs: number = 100
  ): Promise<T> {
    const startTime = Date.now();

    try {
      const result = await query();
      const durationMs = Date.now() - startTime;

      const metric: PerformanceMetric = {
        operationName: `Query: ${queryName}`,
        durationMs,
        slaMs,
        isSlaViolation: durationMs > slaMs,
        timestamp: new Date(),
      };

      this.queryMetrics.push(metric);

      if (metric.isSlaViolation) {
        logger.warn(
          {
            query: queryName,
            durationMs,
            slaMs,
          },
          'Slow database query detected'
        );
      }

      return result;
    } catch (error) {
      logger.error(
        {
          query: queryName,
          error: error instanceof Error ? error.message : String(error),
        },
        'Database query failed'
      );
      throw error;
    }
  }

  /**
   * Get query performance report
   */
  getReport() {
    if (this.queryMetrics.length === 0) {
      return {
        totalQueries: 0,
        avgDurationMs: 0,
        slowQueries: 0,
        slowQueryRate: 0,
      };
    }

    const slowQueries = this.queryMetrics.filter((m) => m.isSlaViolation).length;
    const avgDuration = Math.round(
      this.queryMetrics.reduce((sum, m) => sum + m.durationMs, 0) /
        this.queryMetrics.length
    );

    return {
      totalQueries: this.queryMetrics.length,
      avgDurationMs: avgDuration,
      slowQueries,
      slowQueryRate: (slowQueries / this.queryMetrics.length) * 100,
      metrics: this.queryMetrics,
    };
  }

  /**
   * Clear metrics (for testing)
   */
  clear(): void {
    this.queryMetrics = [];
  }
}

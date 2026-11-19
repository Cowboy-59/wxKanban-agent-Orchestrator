import config from '../config.js';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: Error;
}

class Logger {
  private level: LogLevel;
  private readonly logFilePath: string;
  private readonly maxFieldChars: number;

  private readonly sensitiveKeyPattern = /(api[-_]?key|authorization|token|secret|password|database[_-]?url|cookie)/i;

  constructor(level: LogLevel = 'info') {
    this.level = level;
    this.logFilePath = process.env.MCP_LOG_FILE || join(process.cwd(), 'logs', 'mcp-server.log');
    this.maxFieldChars = config.mcpLogMaxFieldChars;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private format(entry: LogEntry): string {
    const base = `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}`;
    if (entry.context) {
      return `${base} ${JSON.stringify(this.sanitizeValue(entry.context))}`;
    }
    return base;
  }

  private truncateString(value: string): string {
    if (value.length <= this.maxFieldChars) {
      return value;
    }
    return `${value.slice(0, this.maxFieldChars)}...[truncated:${value.length - this.maxFieldChars}]`;
  }

  private sanitizeValue(value: unknown, keyHint?: string): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (keyHint && this.sensitiveKeyPattern.test(keyHint)) {
      return '[redacted]';
    }

    if (typeof value === 'string') {
      return this.truncateString(value);
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.sanitizeValue(entry));
    }

    if (typeof value === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        sanitized[key] = this.sanitizeValue(entry, key);
      }
      return sanitized;
    }

    return value;
  }

  private sanitizeError(error?: Error): Record<string, unknown> | undefined {
    if (!error) {
      return undefined;
    }
    return {
      name: error.name,
      message: this.truncateString(error.message),
      stack: error.stack ? this.truncateString(error.stack) : undefined,
    };
  }

  private writeFile(entry: LogEntry): void {
    try {
      const logDir = dirname(this.logFilePath);
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }

      const serialized = {
        timestamp: entry.timestamp,
        level: entry.level,
        message: entry.message,
        context: entry.context ? this.sanitizeValue(entry.context) : undefined,
        error: this.sanitizeError(entry.error),
      };

      appendFileSync(this.logFilePath, `${JSON.stringify(serialized)}\n`, 'utf8');
    } catch {
      // Best-effort logging only; do not crash server when file write fails.
    }
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error,
    };

    // Console output
    const formatted = this.format(entry);
    if (level === 'error') {
      console.error(formatted);
      if (error) console.error(error);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }

    this.writeFile(entry);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log('error', message, context, error);
  }

  // Audit logging for MCP operations
  audit(
    operation: string,
    tool: string,
    userId: string | undefined,
    projectId: string,
    details: Record<string, unknown>
  ): void {
    this.info('AUDIT', {
      operation,
      tool,
      userId,
      projectId,
      ...details,
      audit: true,
    });
  }
}

export const logger = new Logger(config.logLevel);
export default logger;

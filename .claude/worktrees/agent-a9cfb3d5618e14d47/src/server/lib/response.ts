import { Response } from "express";

/**
 * Standard API response envelope
 */
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  timestamp: string;
}

/**
 * Send a success response
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
): Response {
  return res.status(statusCode).json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Send an error response
 */
export function sendError(
  res: Response,
  error: string,
  statusCode: number = 500,
  code?: string,
): Response {
  return res.status(statusCode).json({
    success: false,
    error,
    code,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Send a paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function sendPaginated<T>(
  res: Response,
  items: T[],
  total: number,
  limit: number,
  offset: number,
  statusCode: number = 200,
): Response {
  const hasMore = offset + limit < total;

  return res.status(statusCode).json({
    success: true,
    data: {
      items,
      total,
      limit,
      offset,
      hasMore,
    },
    timestamp: new Date().toISOString(),
  });
}

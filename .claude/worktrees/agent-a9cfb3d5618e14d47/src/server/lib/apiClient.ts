import axios, { AxiosInstance, AxiosError } from "axios";
import { createLogger } from "./logger.js";

const logger = createLogger("api-client");

interface RetryConfig {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
}

const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
};

export class APIClient {
  private client: AxiosInstance;
  private retryConfig: RetryConfig;

  constructor(
    baseURL: string,
    authToken?: string,
    retryConfig: Partial<RetryConfig> = {},
  ) {
    this.retryConfig = { ...defaultRetryConfig, ...retryConfig };

    this.client = axios.create({
      baseURL,
      timeout: 30000, // 30 second timeout
      headers: {
        "Content-Type": "application/json",
        ...(authToken && { Authorization: `Bearer ${authToken}` }),
      },
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => this.handleError(error),
    );
  }

  private handleError(error: AxiosError): Promise<never> {
    const status = error.response?.status;
    const data = error.response?.data;

    logger.error(
      {
        status,
        url: error.config?.url,
        method: error.config?.method,
        error: data,
      },
      "API request failed",
    );

    return Promise.reject(error);
  }

  async get<T>(url: string, params?: Record<string, any>): Promise<T> {
    return this.requestWithRetry<T>(() => this.client.get<T>(url, { params }));
  }

  async post<T>(url: string, data?: any, config?: any): Promise<T> {
    return this.requestWithRetry<T>(() =>
      this.client.post<T>(url, data, config),
    );
  }

  async put<T>(url: string, data?: any, config?: any): Promise<T> {
    return this.requestWithRetry<T>(() =>
      this.client.put<T>(url, data, config),
    );
  }

  async patch<T>(url: string, data?: any, config?: any): Promise<T> {
    return this.requestWithRetry<T>(() =>
      this.client.patch<T>(url, data, config),
    );
  }

  async delete<T>(url: string): Promise<T> {
    return this.requestWithRetry<T>(() => this.client.delete<T>(url));
  }

  private async requestWithRetry<T>(
    request: () => Promise<any>,
    attempt: number = 1,
  ): Promise<T> {
    try {
      const response = await request();
      return response.data;
    } catch (error) {
      if (
        attempt < this.retryConfig.maxRetries &&
        this.shouldRetry(error as AxiosError)
      ) {
        const delay =
          this.retryConfig.delayMs *
          Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
        logger.warn(
          { attempt, delay, error: (error as AxiosError).message },
          "Retrying request",
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.requestWithRetry<T>(request, attempt + 1);
      }

      throw error;
    }
  }

  private shouldRetry(error: AxiosError): boolean {
    // Retry on network errors or 5xx responses
    if (!error.response) {
      return true; // Network error
    }

    const status = error.response.status;
    return status >= 500 || status === 429; // 5xx or rate limit
  }
}

/**
 * Create a typed API client for a specific service
 */
export function createAPIClient(
  baseURL: string,
  authToken?: string,
  retryConfig?: Partial<RetryConfig>,
): APIClient {
  return new APIClient(baseURL, authToken, retryConfig);
}

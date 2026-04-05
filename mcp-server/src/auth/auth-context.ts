export type UserRole = 'read_only' | 'editor' | 'admin';

export interface AuthContext {
  userId?: string;
  role: UserRole;
  apiKey: string;
  source: string; // 'vscode', 'cli', 'api', etc.
}

export interface AuthError extends Error {
  code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_KEY';
}

export function createAuthError(message: string, code: AuthError['code']): AuthError {
  const error = new Error(message) as AuthError;
  error.code = code;
  error.name = 'AuthError';
  return error;
}

import { useState, useCallback } from 'react';

interface SignInResult {
  success: boolean;
  error?: string;
  token?: string;
}

interface UseAuthReturn {
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
}

export function useAuth(): UseAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    try {
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error || 'Invalid email or password',
        };
      }

      const data = await response.json();
      setIsAuthenticated(true);
      
      return {
        success: true,
        token: data.token,
      };
    } catch (err) {
      return {
        success: false,
        error: 'Network error. Please try again.',
      };
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await fetch('/api/auth/signout', {
        method: 'POST',
      });
      setIsAuthenticated(false);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  }, []);

  return {
    signIn,
    signOut,
    isAuthenticated,
  };
}

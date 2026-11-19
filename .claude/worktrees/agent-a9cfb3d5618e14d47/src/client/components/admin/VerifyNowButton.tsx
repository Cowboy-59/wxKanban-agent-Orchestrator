/**
 * VerifyNowButton Component
 * T015b - Admin UI "Verify Now" button
 * Allows administrators to bypass email verification for users
 */

import { useState } from 'react';
import { Button } from '~/client/components/ui/Button';
import { LoadingSpinner } from '~/client/components/ui/LoadingSpinner';

interface VerifyNowButtonProps {
  userId: string;
  userEmail: string;
  onVerify?: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function VerifyNowButton({
  userId,
  userEmail,
  onVerify,
  variant = 'outline',
  size = 'sm',
  className = '',
}: VerifyNowButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const handleVerify = async () => {
    if (!confirm(`Bypass email verification for ${userEmail}?`)) {
      return;
    }

    setIsLoading(true);
    setMessage(null);
    setIsError(false);

    try {
      const response = await fetch(`/api/admin/users/${userId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify user');
      }

      setMessage(`${userEmail} has been verified successfully.`);
      onVerify?.();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Verification failed';
      setMessage(msg);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleVerify}
        disabled={isLoading}
        className={className}
      >
        {isLoading ? (
          <LoadingSpinner size="sm" className="mr-2" />
        ) : (
          <svg
            className="mr-2 h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
        Verify Now
      </Button>
      {message && (
        <div className={`mt-2 text-sm ${isError ? 'text-red-600' : 'text-green-600'}`}>
          {message}
        </div>
      )}
    </>
  );
}

export default VerifyNowButton;

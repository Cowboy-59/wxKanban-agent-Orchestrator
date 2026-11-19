/// <reference types="vite/client" />
import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface InvitationProgress {
  batchId: string;
  total: number;
  sent: number;
  failed: number;
  status: string;
  currentEmail?: string;
  error?: string;
  timestamp: string;
}

interface BatchComplete {
  batchId: string;
  total: number;
  successful: number;
  failed: number;
  failedEmails?: Array<{ email: string; reason: string }>;
  timestamp: string;
}

interface UseInvitationProgressReturn {
  progress: InvitationProgress | null;
  complete: BatchComplete | null;
  isConnected: boolean;
  error: string | null;
}

/**
 * useInvitationProgress Hook
 * Subscribe to real-time invitation progress updates via Socket.IO
 */
export function useInvitationProgress(batchId: string | null): UseInvitationProgressReturn {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [progress, setProgress] = useState<InvitationProgress | null>(null);
  const [complete, setComplete] = useState<BatchComplete | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (!batchId) return;

    const newSocket = io(import.meta.env.VITE_API_URL || 'http://localhost:3000', {
      auth: {
        token: document.cookie.replace(/(?:(?:^|.*;\s*)token\s*\=\s*([^;]*).*$)|^.*$/, '$1'),
      },
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      // Subscribe to batch updates
      newSocket.emit('subscribe-batch', batchId);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      setError(`Connection error: ${err.message}`);
      setIsConnected(false);
    });

    newSocket.on('invitation-progress', (data: InvitationProgress) => {
      setProgress(data);
    });

    newSocket.on('batch-complete', (data: BatchComplete) => {
      setComplete(data);
      // Unsubscribe after completion
      newSocket.emit('unsubscribe-batch', batchId);
    });

    setSocket(newSocket);

    return () => {
      newSocket.emit('unsubscribe-batch', batchId);
      newSocket.close();
    };
  }, [batchId]);

  useEffect(() => {
    const cleanup = connect();

    return () => {
      if (cleanup) cleanup();
      if (socket) {
        socket.close();
      }
    };
  }, [connect]);

  return {
    progress,
    complete,
    isConnected,
    error,
  };
}

export default useInvitationProgress;

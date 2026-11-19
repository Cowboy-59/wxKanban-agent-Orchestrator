import { useState, useCallback } from "react";

export interface PMConnection {
  connectionid: string;
  pmsystem: string;
  syncstatus: "active" | "expired" | "failed";
  lastsyncsat?: string;
  createdat: string;
}

export function usePMConnections() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getConnections = useCallback(async (): Promise<PMConnection[]> => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/pm-systems", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch connections");
      }

      const data = await response.json();
      return data.data || [];
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch connections";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getConnection = useCallback(
    async (system: string): Promise<PMConnection | null> => {
      setError(null);
      setIsLoading(true);

      try {
        const response = await fetch(`/api/pm-systems/${system}`, {
          credentials: "include",
        });

        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch ${system} connection`);
        }

        const data = await response.json();
        return data.data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch connection";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const disconnectPMSystem = useCallback(
    async (system: string): Promise<void> => {
      setError(null);
      setIsLoading(true);

      try {
        const response = await fetch(`/api/pm-systems/${system}`, {
          method: "DELETE",
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`Failed to disconnect ${system}`);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to disconnect";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return {
    getConnections,
    getConnection,
    disconnectPMSystem,
    isLoading,
    error,
  };
}

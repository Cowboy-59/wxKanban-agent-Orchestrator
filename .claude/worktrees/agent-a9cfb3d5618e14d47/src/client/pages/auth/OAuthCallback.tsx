import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function OAuthCallbackPage() {
  const { system } = useParams<{ system: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;
    const handleCallback = async () => {
      try {
        if (!system) {
          throw new Error("Unknown PM system");
        }

        const pmsystem = system.toLowerCase();
        const queryParams = new URLSearchParams(window.location.search);
        const state = queryParams.get("state");

        if (!state) {
          throw new Error("Missing OAuth state parameter");
        }

        // Trello's token-flow returns the token in the URL fragment
        // (#token=…), not a query param. Every other provider returns a
        // standard OAuth 2.0 authorization code in the query.
        const body: Record<string, string> = { pmsystem, state };
        if (pmsystem === "trello") {
          const hash = window.location.hash.replace(/^#/, "");
          const fragment = new URLSearchParams(hash);
          const token = fragment.get("token");
          if (!token) {
            throw new Error("Missing Trello token in callback URL");
          }
          body.token = token;
        } else {
          const code = queryParams.get("code");
          if (!code) {
            throw new Error("Missing authorization code from OAuth provider");
          }
          body.code = code;
        }

        // Send code/token to backend
        const response = await fetch("/api/pm-systems", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to connect PM system");
        }

        // Success - redirect to integrations page
        setTimeout(() => {
          navigate("/integrations?success=true", { replace: true });
        }, 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "OAuth callback failed");
        setIsProcessing(false);
      }
    };

    handleCallback();
  }, [system, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md text-center">
        {isProcessing && !error && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Connecting {system?.toUpperCase()}...
            </h2>
            <p className="text-gray-600">
              Please wait while we complete your connection
            </p>
          </>
        )}

        {error && (
          <>
            <div className="text-red-600 text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Connection Failed
            </h2>
            <p className="text-red-600 mb-6">{error}</p>
            <button
              onClick={() => navigate("/integrations", { replace: true })}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg"
            >
              Return to Integrations
            </button>
          </>
        )}
      </div>
    </div>
  );
}

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import type { Setting } from "~/shared/types/settings";

export interface User {
  userid: string;
  email: string;
  fullname: string | null;
  usertype: string;
  active: boolean;
  securitylevel: number;
  payrate: string | null;
  payratemethod: string | null;
  profiletype: string | null;
  responsibility: string | null;
  timezone: string;
  language: string; // [SCOPE 051] preferred UI locale (e.g. "en-US")
  tracktime: boolean;
  // [profile self-service] photo URL, chat-on-login, and unverified pending email.
  avatarurl: string | null;
  startchat: boolean;
  pendingemail: string | null;
  // [SCOPE 064 / T010] Amendment A — newsletter opt-in (true = subscribed).
  newsletterupdates: boolean;
  newsletterpromos: boolean;
  joinedat: string | null;
  lastloginedat: string | null;
  requirepasswordchange?: boolean;

  companyid: string;
  companyname: string;
  companyemail: string;
  billingplan: string;
  subscriptionstatus: string;
  maxusers: number;
  seatsused: number;
  hourlyrate: string | null;
  logourl: string | null;
  companyactiveflag: boolean;
  companyverifiedat: string | null;
  companycreatedat: string;
  // [SCOPE 090 / T006] Amendment A FR-010 — inputs to the subscription access gate.
  billingexempt: boolean;
  companyadminemail: string | null;

  settings?: Setting[];
  token?: string;
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function parseErrorResponse(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    return data.error || data.message || fallback;
  } catch {
    return fallback;
  }
}

function mapUserFromResponse(data: Record<string, unknown>): User {
  const nested = data.user as Record<string, unknown> | undefined;
  const u: Record<string, unknown> = nested ? { ...nested } : { ...data };

  const token = (data.token as string | undefined) ?? (u.token as string | undefined);
  const userid = (u.userid as string) ?? (u.id as string);

  return {
    userid,
    email: (u.email as string) ?? "",
    fullname: (u.fullname as string | null) ?? null,
    usertype: (u.usertype as string) ?? "TEAM_MEMBER",
    active: (u.active as boolean) ?? true,
    securitylevel: (u.securitylevel as number) ?? 7,
    payrate: (u.payrate as string | null) ?? null,
    payratemethod: (u.payratemethod as string | null) ?? null,
    profiletype: (u.profiletype as string | null) ?? null,
    responsibility: (u.responsibility as string | null) ?? null,
    timezone: (u.timezone as string) ?? "UTC",
    tracktime: (u.tracktime as boolean) ?? true,
    // [profile self-service]
    avatarurl: (u.avatarurl as string | null) ?? null,
    startchat: (u.startchat as boolean) ?? true,
    pendingemail: (u.pendingemail as string | null) ?? null,
    // [SCOPE 064 / T010] default to subscribed if the server omits the field.
    newsletterupdates: (u.newsletterupdates as boolean) ?? true,
    newsletterpromos: (u.newsletterpromos as boolean) ?? true,
    joinedat: (u.joinedat as string | null) ?? null,
    lastloginedat: (u.lastloginedat as string | null) ?? null,
    requirepasswordchange: (u.requirepasswordchange as boolean) ?? false,

    companyid: (u.companyid as string) ?? "",
    companyname: (u.companyname as string) ?? "",
    companyemail: (u.companyemail as string) ?? "",
    billingplan: (u.billingplan as string) ?? "FREE",
    subscriptionstatus: (u.subscriptionstatus as string) ?? "ACTIVE",
    maxusers: (u.maxusers as number) ?? 5,
    seatsused: (u.seatsused as number) ?? 0,
    hourlyrate: (u.hourlyrate as string | null) ?? null,
    logourl: (u.logourl as string | null) ?? null,
    companyactiveflag: (u.companyactiveflag as boolean) ?? true,
    // [SCOPE 090 / T006] Amendment A FR-010. billingexempt defaults FALSE, unlike
    // its neighbours: an absent field must not hand out a free pass to the gate.
    billingexempt: (u.billingexempt as boolean) ?? false,
    companyadminemail: (u.companyadminemail as string | null) ?? null,
    companyverifiedat: (u.companyverifiedat as string | null) ?? null,
    companycreatedat: (u.companycreatedat as string) ?? "",

    settings: u.settings as Setting[] | undefined,
    token,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          const userData = mapUserFromResponse(data);
          const storedToken = localStorage.getItem("wxkanban_token");
          setUser(storedToken && !userData.token ? { ...userData, token: storedToken } : userData);
        } else {
          setUser(null);
          localStorage.removeItem("wxkanban_token");
        }
      } catch {
        setUser(null);
        localStorage.removeItem("wxkanban_token");
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const message = await parseErrorResponse(response, "Login failed");
        throw new Error(message);
      }

      const data = await response.json();
      const userData = mapUserFromResponse(data);

      if (userData.token) {
        localStorage.setItem("wxkanban_token", userData.token);
      }

      setUser(userData);
      return userData;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string): Promise<void> => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const message = await parseErrorResponse(response, "Registration failed");
        throw new Error(message);
      }

      const data = await response.json();
      const userData = mapUserFromResponse(data);

      if (userData.token) {
        localStorage.setItem("wxkanban_token", userData.token);
      }

      setUser(userData);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setError(null);
    setIsLoading(true);

    try {
      // Best-effort server cookie clear; never let a network error block the
      // local sign-out below.
      await fetch("/api/auth/signout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore — we still clear local auth state and redirect
    } finally {
      // Always clear local auth, then hard-redirect to the public landing page.
      // A full-page load (not SPA navigate) guarantees every login type
      // (ADMIN, TEAM_*, SYSADMIN) is fully torn down — no stale React/query
      // state can keep a session alive.
      localStorage.removeItem("wxkanban_token");
      setUser(null);
      setIsLoading(false);
      window.location.replace("/");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        setUser,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

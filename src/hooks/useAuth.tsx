import { createContext, useContext, useEffect, useState } from "react";
import { localApiFetch, getLocalSessionToken, setLocalSessionToken } from "@/lib/localApi";
import { useToast } from "@/hooks/use-toast";

export interface LocalUser {
  id: string;
  email: string;
  user_metadata: { full_name: string };
}

export interface LocalSession {
  access_token: string;
  user: LocalUser;
}

interface AuthContextType {
  user: LocalUser | null;
  session: LocalSession | null;
  loading: boolean;
  signIn: (loginId: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [session, setSession] = useState<LocalSession | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let active = true;
    const loadSession = async () => {
      if (!getLocalSessionToken()) {
        if (active) setLoading(false);
        return;
      }
      try {
        const result = await localApiFetch<{ session: LocalSession | null; user: LocalUser | null }>(
          "/auth/session",
        );
        if (!active) return;
        setSession(result.session);
        setUser(result.user);
        if (!result.session) setLocalSessionToken(null);
      } catch (error) {
        if (active) {
          setLocalSessionToken(null);
          console.error("Failed to restore local sign-in session:", error);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadSession();
    return () => {
      active = false;
    };
  }, []);

  const signIn = async (loginId: string, password: string) => {
    setLoading(true);
    try {
      const result = await localApiFetch<{ access_token: string; user: LocalUser }>(
        "/auth/sign-in",
        { method: "POST", body: JSON.stringify({ loginId, password }) },
      );
      setLocalSessionToken(result.access_token);
      const nextSession = { access_token: result.access_token, user: result.user };
      setSession(nextSession);
      setUser(result.user);
      toast({ title: "Welcome back!", description: "You have successfully signed in." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not sign in.";
      toast({ title: "Sign in failed", description: message, variant: "destructive" });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (_email: string, _password: string, _fullName: string) => {
    const error = new Error("Account creation is restricted. Ask an administrator to create your account.");
    toast({ title: "Sign up unavailable", description: error.message, variant: "destructive" });
    throw error;
  };

  const signOut = async () => {
    try {
      await localApiFetch<{ ok: boolean }>("/auth/sign-out", { method: "POST" });
    } catch (error) {
      console.error("Local sign-out request failed:", error);
    } finally {
      setLocalSessionToken(null);
      setSession(null);
      setUser(null);
      toast({ title: "Signed out", description: "You have been successfully signed out." });
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

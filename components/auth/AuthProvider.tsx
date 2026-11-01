"use client";

/**
 * Client auth context: Google popup sign-in → session handshake with the
 * server → account overview (plan + usage this period).
 *
 * State derives from Firebase's own identity signal (onAuthStateChanged,
 * so the UI reacts to sign-in instantly and survives page reloads via
 * indexedDB persistence), while any SERVER-gated values (plan, usage)
 * come from /api/auth/me — the source of truth the API routes enforce.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from "firebase/auth";
import type { User } from "firebase/auth";

import { getFirebaseAuth, googleProvider } from "@/lib/auth/firebase-client";
import { PLAN_LIMITS, type Plan } from "@/lib/plans";

export type AccountOverview = {
  user: { uid: string; email: string | null; name: string | null; picture: string | null };
  plan: Plan;
  limits: { generationsPerMonth: number; maxQuestions: number; research: boolean };
  period: string;
  used: number;
};

type AuthState = {
  loading: boolean;
  user: User | null;
  /* Server-known values (null while unverified or during the handshake). */
  overview: AccountOverview | null;
  /** True when the server reports the admin SDK (gates) as live. */
  gatesLive: boolean;
  signInError: string | null;
  plan: () => Plan;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [gatesLive, setGatesLive] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  /** Verify the httpOnly session server-side and refresh plan/usage. */
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | (AccountOverview & { gatesLive?: boolean })
        | null;
      if (data?.user) {
        setOverview(data);
        setGatesLive(Boolean(data.gatesLive));
      } else {
        setOverview(null);
        setGatesLive(Boolean(data?.gatesLive));
      }
    } catch {
      // network hiccup — keep the last known overview
    }
  }, []);

  // Identity signal → sync Firebase user, then the server handshake.
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (u) => {
      setUser(u);
      if (u) {
        // Exchange the fresh ID token for the httpOnly session cookie.
        void u
          .getIdToken()
          .then((idToken) =>
            fetch("/api/auth/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idToken }),
            }),
          )
          .then(() => refresh())
          .catch(() => {
            /* session mint failing keeps the UI signed-in client-side; API routes stay ungated */
          })
          .finally(() => setLoading(false));
      } else {
        setOverview(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, [refresh]);

  const plan = useCallback((): Plan => overview?.plan ?? "free", [overview]);

  const signInWithGoogle = useCallback(async () => {
    setSignInError(null);
    try {
      await signInWithPopup(getFirebaseAuth(), googleProvider);
      await refresh();
    } catch (exc) {
      const code = (exc as { code?: string }).code ?? "";
      const friendly =
        code === "auth/popup-closed-by-user"
          ? null // closed the popup — not an outage, no message needed
          : code === "auth/unauthorized-domain"
            ? "This domain isn't authorised for sign-in yet — add it under Firebase → Authentication → Settings → Authorized domains."
            : code === "auth/popup-blocked"
              ? "Your browser blocked the sign-in window — allow popups for this site and try again."
              : "Google sign-in failed unexpectedly — please try again.";
      if (friendly) setSignInError(friendly);
    }
  }, [refresh]);

  const signOut = useCallback(async () => {
    await fbSignOut(getFirebaseAuth());
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setOverview(null);
  }, []);

  const value = useMemo(
    () => ({ loading, user, overview, gatesLive, signInError, plan, signInWithGoogle, signOut, refresh }),
    [loading, user, overview, gatesLive, signInError, plan, signInWithGoogle, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>.");
  return ctx;
}

export const FREE_LIMIT = PLAN_LIMITS.free.generationsPerMonth;

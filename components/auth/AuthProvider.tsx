"use client";

/**
 * Client auth context: Google popup sign-in → session handshake with the
 * server → account overview (tier + usage this period).
 *
 * Guest tier: every visitor without a Google session is silently upgraded
 * to an ANONYMOUS Firebase identity. That gives guests a server-side uid,
 * so their (strict) 5-generation quota survives refreshes — clearing
 * browser data is the only reset, which is the accepted trade-off.
 *
 * State derives from Firebase's own identity signal (onAuthStateChanged,
 * survives page reloads via indexedDB persistence), while SERVER-gated
 * values (tier, usage) come from /api/auth/me — the authority the API
 * routes enforce. Server-sent tier is the only one the UI acts on.
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
import { onAuthStateChanged, signInAnonymously, signInWithPopup, signOut as fbSignOut } from "firebase/auth";
import type { User } from "firebase/auth";

import { getFirebaseAuth, googleProvider } from "@/lib/auth/firebase-client";
import { TIER_LIMITS, type Tier, type TierLimits } from "@/lib/plans";

export type AccountOverview = {
  user: { uid: string; email: string | null; name: string | null; picture: string | null };
  tier: Tier;
  plan: string;
  limits: TierLimits;
  period: string;
  used: { generations: number; downloads: number };
};

type AuthState = {
  loading: boolean;
  /** null only while Firebase bootstraps; guests get an anonymous User. */
  user: User | null;
  isGuest: boolean;
  tier: Tier;
  overview: AccountOverview | null;
  /** True when the server reports the admin SDK (gates) as live. */
  gatesLive: boolean;
  signInError: string | null;
  tierLimits: () => TierLimits;
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

  /** Verify the httpOnly session server-side and refresh tier/usage. */
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | (AccountOverview & { signedIn?: boolean; gatesLive?: boolean })
        | null;
      if (data?.signedIn) {
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

    // Identity signal → sync Firebase user, then the session handshake.
    // EVERY user — including anonymous guests — mints the httpOnly session
    // cookie: the server-side tier/quota engine can only identify who it
    // is talking to through that cookie. Skipping it for guests would
    // leave guest traffic unauthenticated (and the API refuses it).
    useEffect(() => {
      const boot = () => setLoading(false);
      if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
      // No Firebase config at build time: nothing to subscribe. Deferred a
      // frame per the repo's effect/setState convention (no sync setState).
      const raf = requestAnimationFrame(boot);
      return () => cancelAnimationFrame(raf);
    }
    let cancelled = false;
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
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
            /* a failed mint keeps the UI signed-in client-side; the server
               still refuses access until the cookie exists */
          });
      } else {
        void refresh(); // /me re-reads (or clears) the overview
      }
      if (!cancelled) setLoading(false);
    });

    // No identity at all → mint an anonymous (guest) identity once.
    const timer = setTimeout(() => {
      if (!auth.currentUser && !cancelled) {
        signInAnonymously(auth).catch(() => {
          /* anonymous auth disabled or offline: signed-out rendering wins */
          setLoading(false);
        });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [refresh]);

  const isGuest = Boolean(user?.isAnonymous);
  const tier: Tier = isGuest ? "guest" : (overview?.tier ?? (user ? "free" : "guest"));
  const tierLimits = useCallback(
    () => overview?.limits ?? TIER_LIMITS.guest,
    [overview],
  );

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
    const auth = getFirebaseAuth();
    const wasUser = auth.currentUser;
    if (wasUser && !wasUser.isAnonymous) {
      // End the server session properly (cookie clear + token revocation).
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    }
    await fbSignOut(auth);
    // Return to a fresh guest identity (no cookie, no history persistence).
    await signInAnonymously(auth).catch(() => {});
    setOverview(null);
  }, []);

  const value = useMemo(
    () => ({ loading, user, isGuest, tier, overview, gatesLive, signInError, tierLimits, signInWithGoogle, signOut, refresh }),
    [loading, user, isGuest, tier, overview, gatesLive, signInError, tierLimits, signInWithGoogle, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>.");
  return ctx;
}

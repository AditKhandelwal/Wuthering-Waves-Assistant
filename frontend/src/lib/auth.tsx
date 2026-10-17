import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./supabase";

const NOT_CONFIGURED_ERROR =
  "Sign-in isn't set up yet -- Supabase isn't configured (see frontend/.env.example).";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  // confirmationRequired: true only when Supabase actually withheld a
  // session pending email confirmation. When "Confirm email" is off in
  // the Supabase dashboard, signUp() signs the user in immediately (a
  // session comes back right away) -- the caller needs to know which
  // happened to show the right message, since "check your email" is
  // wrong and confusing when no confirmation was ever going to be
  // required. A real user hit exactly this: confirmation was already
  // off, they were signed in immediately, but the UI told them to go
  // check an email that was never coming.
  signUp: (email: string, password: string) => Promise<{ error: string | null; confirmationRequired: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null; confirmationRequired: boolean }>;
  signOut: () => Promise<void>;
  // Sends a password-reset email with a link to /reset-password. There
  // was previously no way to recover a forgotten password at all -- a
  // real user hit this dead end directly.
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  // Only valid when called from a session established by clicking that
  // reset link (Supabase's recovery flow signs the user into a short-lived
  // "recovery" session automatically on landing, via detectSessionInUrl --
  // see ResetPasswordPage.tsx). Calling this with no such session fails.
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signUp(email: string, password: string) {
    if (!isSupabaseConfigured) return { error: NOT_CONFIGURED_ERROR, confirmationRequired: false };
    const { data, error } = await supabase.auth.signUp({ email, password });
    // data.session is non-null the moment signUp() succeeds if "Confirm
    // email" is off (the user is signed in immediately) -- null means
    // Supabase is actually waiting on a confirmation click.
    return { error: error?.message ?? null, confirmationRequired: !error && !data.session };
  }

  async function signIn(email: string, password: string) {
    // confirmationRequired is always false here -- it only exists so
    // AuthModal can share one result shape across both sign-in and
    // sign-up instead of branching on which function was called.
    if (!isSupabaseConfigured) return { error: NOT_CONFIGURED_ERROR, confirmationRequired: false };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null, confirmationRequired: false };
  }

  async function signOut() {
    if (!isSupabaseConfigured) return;
    await supabase.auth.signOut();
  }

  async function resetPassword(email: string) {
    if (!isSupabaseConfigured) return { error: NOT_CONFIGURED_ERROR };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message ?? null };
  }

  async function updatePassword(newPassword: string) {
    if (!isSupabaseConfigured) return { error: NOT_CONFIGURED_ERROR };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  }

  return (
    <AuthContext.Provider
      value={{ user: session?.user ?? null, loading, signUp, signIn, signOut, resetPassword, updatePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

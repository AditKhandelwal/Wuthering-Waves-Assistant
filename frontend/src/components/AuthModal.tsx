import { useState } from "react";
import { Modal } from "./Modal";
import { useAuth } from "../lib/auth";

interface AuthModalProps {
  onClose: () => void;
}

type Mode = "sign-in" | "sign-up" | "reset";

export function AuthModal({ onClose }: AuthModalProps) {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signedUp, setSignedUp] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "reset") {
      setSubmitting(true);
      const result = await resetPassword(email);
      setSubmitting(false);
      if (result.error) {
        setError(result.error);
      } else {
        setResetSent(true);
      }
      return;
    }

    if (mode === "sign-up" && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const result = mode === "sign-in" ? await signIn(email, password) : await signUp(email, password);

    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    } else if (result.confirmationRequired) {
      // Supabase actually withheld a session pending email confirmation
      // -- only show this when that's genuinely true. Previously this
      // branch fired on every successful sign-up unconditionally, which
      // told a real user to go check an email that was never coming:
      // "Confirm email" was off, so Supabase had already signed them in,
      // but the UI didn't know that and showed the wrong message anyway.
      setSignedUp(true);
    } else {
      onClose();
    }
  }

  const title = mode === "sign-in" ? "Sign In" : mode === "sign-up" ? "Create Account" : "Reset Password";

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-text-muted">{title}</h2>

      {signedUp ? (
        <p className="text-sm text-text">Check your email to confirm your account, then sign in.</p>
      ) : resetSent ? (
        <p className="text-sm text-text">
          If an account exists for <span className="text-gold-soft">{email}</span>, a password reset link has
          been sent. Click it to set a new password.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoFocus
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-sm border border-border bg-panel px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-gold-soft focus:outline-none"
          />
          {mode !== "reset" && (
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-sm border border-border bg-panel px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-gold-soft focus:outline-none"
            />
          )}
          {mode === "sign-up" && (
            <input
              type="password"
              required
              minLength={6}
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-sm border border-border bg-panel px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-gold-soft focus:outline-none"
            />
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-sm border border-gold px-3 py-2 text-sm text-gold-soft transition hover:bg-panel-alt disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "..." : mode === "sign-in" ? "Sign In" : mode === "sign-up" ? "Create Account" : "Send Reset Link"}
          </button>

          {mode === "sign-in" && (
            <button
              type="button"
              onClick={() => switchMode("reset")}
              className="text-xs text-text-muted underline-offset-2 hover:text-gold-soft hover:underline"
            >
              Forgot password?
            </button>
          )}

          <button
            type="button"
            onClick={() => switchMode(mode === "sign-up" ? "sign-in" : mode === "reset" ? "sign-in" : "sign-up")}
            className="text-xs text-text-muted underline-offset-2 hover:text-gold-soft hover:underline"
          >
            {mode === "sign-up"
              ? "Already have an account? Sign in"
              : mode === "reset"
                ? "Back to sign in"
                : "Need an account? Sign up"}
          </button>
        </form>
      )}
    </Modal>
  );
}

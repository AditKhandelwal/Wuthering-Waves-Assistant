import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

// Landing page for the link sent by resetPassword() (auth.tsx). Supabase's
// client auto-detects the recovery token in this URL's fragment
// (detectSessionInUrl, on by default) and signs the user into a
// short-lived "recovery" session before this component ever renders --
// no code here reads the URL itself. updatePassword() just needs that
// session to already exist; if the link was invalid/expired, Supabase
// never established one and the update call below fails with its own
// error, which is surfaced the same way any other auth error is.
export function ResetPasswordPage() {
  const { user, loading, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const result = await updatePassword(password);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else {
      setDone(true);
    }
  }

  return (
    <div className="mx-auto max-w-md px-8 py-16 text-center">
      <h1 className="mb-6 text-xs font-semibold uppercase tracking-widest text-text-muted">Reset Password</h1>

      {loading ? (
        <p className="text-sm text-text-muted">Loading...</p>
      ) : done ? (
        <p className="text-sm text-text">Your password has been updated.</p>
      ) : !user ? (
        <p className="text-sm text-text-muted">
          This reset link is invalid or has expired. Request a new one from the sign-in screen.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col items-center gap-3">
          <input
            type="password"
            required
            autoFocus
            minLength={6}
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-sm border border-border bg-panel px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-gold-soft focus:outline-none"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-sm border border-border bg-panel px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-gold-soft focus:outline-none"
          />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 w-full rounded-sm border border-gold px-3 py-2 text-sm text-gold-soft transition hover:bg-panel-alt disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "..." : "Set New Password"}
          </button>
        </form>
      )}

      <Link
        to="/"
        className="mt-8 inline-block text-xs text-text-muted underline-offset-2 hover:text-gold-soft hover:underline"
      >
        Back to site
      </Link>
    </div>
  );
}

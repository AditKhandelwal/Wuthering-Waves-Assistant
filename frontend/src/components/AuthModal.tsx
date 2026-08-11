import { useState } from "react";
import { Modal } from "./Modal";
import { useAuth } from "../lib/auth";

interface AuthModalProps {
  onClose: () => void;
}

export function AuthModal({ onClose }: AuthModalProps) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signedUp, setSignedUp] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = mode === "sign-in" ? await signIn(email, password) : await signUp(email, password);

    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    } else if (mode === "sign-up") {
      setSignedUp(true);
    } else {
      onClose();
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-text-muted">
        {mode === "sign-in" ? "Sign In" : "Create Account"}
      </h2>

      {signedUp ? (
        <p className="text-sm text-text">
          Check your email to confirm your account, then sign in.
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
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-sm border border-border bg-panel px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-gold-soft focus:outline-none"
          />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-sm border border-gold px-3 py-2 text-sm text-gold-soft transition hover:bg-panel-alt disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "..." : mode === "sign-in" ? "Sign In" : "Create Account"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setError(null);
            }}
            className="text-xs text-text-muted underline-offset-2 hover:text-gold-soft hover:underline"
          >
            {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </form>
      )}
    </Modal>
  );
}

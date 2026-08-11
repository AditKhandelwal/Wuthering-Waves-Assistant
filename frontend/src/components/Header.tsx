import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { AuthModal } from "./AuthModal";

export function Header() {
  const { user, loading, signOut } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  return (
    <>
      <header className="border-b border-border bg-panel">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-8 py-3">
          <Link to="/" className="text-sm font-semibold uppercase tracking-widest text-gold-soft">
            WuWa Build Planner
          </Link>

          <div className="flex items-center gap-4 text-sm">
            <Link to="/builds" className="text-text-muted transition hover:text-gold-soft">
              My Builds
            </Link>
            <Link to="/chat" className="text-text-muted transition hover:text-gold-soft">
              Chat
            </Link>

            {loading ? null : user ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-muted">{user.email}</span>
                <button
                  onClick={() => signOut()}
                  className="rounded-sm border border-border px-2.5 py-1 text-xs text-text-muted transition hover:border-gold-soft hover:text-gold-soft"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAuthModalOpen(true)}
                className="rounded-sm border border-gold-soft px-2.5 py-1 text-xs text-gold-soft transition hover:bg-panel-alt"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)} />}
    </>
  );
}

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { lookupLinkCode, confirmLink, type LinkCode, type LinkCodeStatus } from "../lib/discordLink";
import { AuthModal } from "../components/AuthModal";

export function LinkDiscordPage() {
  const { code } = useParams<{ code: string }>();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<LinkCodeStatus | "loading">("loading");
  const [linkCode, setLinkCode] = useState<LinkCode | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!code) return;
    lookupLinkCode(code).then(({ status, linkCode }) => {
      setStatus(status);
      setLinkCode(linkCode);
    });
  }, [code]);

  async function handleConfirm() {
    if (!user || !linkCode) return;
    setConfirming(true);
    setConfirmError(null);
    const { error } = await confirmLink(user.id, linkCode);
    setConfirming(false);
    if (error) {
      setConfirmError(error);
      return;
    }
    setDone(true);
  }

  return (
    <div className="mx-auto max-w-md px-8 py-16 text-center">
      <h1 className="mb-6 text-xs font-semibold uppercase tracking-widest text-text-muted">
        Link Discord Account
      </h1>

      {status === "loading" || authLoading ? (
        <p className="text-sm text-text-muted">Loading...</p>
      ) : status === "not_found" ? (
        <p className="text-sm text-text-muted">
          This link code wasn't found. Run <span className="text-gold-soft">/link</span> in Discord again to
          get a new one.
        </p>
      ) : status === "expired" ? (
        <p className="text-sm text-text-muted">
          This link code has expired. Run <span className="text-gold-soft">/link</span> in Discord again to
          get a new one.
        </p>
      ) : status === "used" ? (
        <p className="text-sm text-text-muted">This link code has already been used.</p>
      ) : done ? (
        <p className="text-sm text-text">
          Linked! <span className="text-gold-soft">/builds</span> and{" "}
          <span className="text-gold-soft">/build</span> will now work for{" "}
          <span className="text-gold-soft">{linkCode?.discordUsername}</span> in Discord.
        </p>
      ) : !user ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-text-muted">
            Sign in to link your account to Discord user{" "}
            <span className="text-gold-soft">{linkCode?.discordUsername}</span>.
          </p>
          <button
            onClick={() => setAuthModalOpen(true)}
            className="rounded-sm border border-gold-soft px-3 py-2 text-sm text-gold-soft transition hover:bg-panel-alt"
          >
            Sign In
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-text-muted">
            Link this account ({user.email}) to Discord user{" "}
            <span className="text-gold-soft">{linkCode?.discordUsername}</span>?
          </p>
          {confirmError && <p className="text-xs text-red-400">{confirmError}</p>}
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="rounded-sm border border-gold px-3 py-2 text-sm text-gold-soft transition hover:bg-panel-alt disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirming ? "..." : "Confirm Link"}
          </button>
        </div>
      )}

      {authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)} />}

      <Link
        to="/"
        className="mt-8 inline-block text-xs text-text-muted underline-offset-2 hover:text-gold-soft hover:underline"
      >
        Back to site
      </Link>
    </div>
  );
}

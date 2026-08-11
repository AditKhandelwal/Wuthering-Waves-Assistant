import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { loadAllBuildSummaries, deleteBuild, type SavedBuildSummary } from "../lib/builds";
import { loadRoster } from "../lib/characters";
import { ELEMENT_RING_CLASS } from "../components/CharacterCard";
import type { Character } from "../types/character";

export function MyBuildsPage() {
  const { user, loading: authLoading } = useAuth();
  const [builds, setBuilds] = useState<SavedBuildSummary[] | null>(null);
  const [roster, setRoster] = useState<Character[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadRoster().then(({ characters }) => setRoster(characters));
  }, []);

  useEffect(() => {
    if (!user) {
      setBuilds(null);
      return;
    }
    loadAllBuildSummaries(user.id).then(setBuilds);
  }, [user]);

  async function handleDelete(roleGbId: string) {
    if (!user) return;
    setDeletingId(roleGbId);
    await deleteBuild(user.id, roleGbId);
    setBuilds((current) => current?.filter((b) => b.roleGbId !== roleGbId) ?? null);
    setDeletingId(null);
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="mb-6 text-xs font-semibold uppercase tracking-widest text-text-muted">
        My Builds
      </h1>

      {authLoading || (user && builds === null) ? (
        <p className="text-sm text-text-muted">Loading...</p>
      ) : !user ? (
        <p className="text-sm text-text-muted">Sign in to view and manage your saved builds.</p>
      ) : builds && builds.length === 0 ? (
        <p className="text-sm text-text-muted">
          No saved builds yet. Open a character and hit "Save Build" to add one here.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {builds?.map((build) => {
            const character = roster.find((c) => c.roleGbId === build.roleGbId);
            return (
              <div
                key={build.roleGbId}
                className="group relative flex flex-col items-center gap-1.5 rounded-sm border border-border p-3 text-center transition hover:border-gold-soft"
              >
                <button
                  onClick={() => handleDelete(build.roleGbId)}
                  disabled={deletingId === build.roleGbId}
                  className="absolute right-1.5 top-1.5 rounded-sm border border-border bg-panel px-1.5 py-0.5 text-[10px] leading-none text-text-muted transition hover:border-red-400 hover:text-red-400 disabled:opacity-50"
                >
                  {deletingId === build.roleGbId ? "..." : "✕"}
                </button>

                <Link to={`/build/${build.roleGbId}`} className="flex min-w-0 flex-col items-center gap-1.5">
                  {character ? (
                    <span
                      className={`h-16 w-16 overflow-hidden rounded-full ring-2 ${ELEMENT_RING_CLASS[character.element]}`}
                    >
                      <img
                        src={character.cardPictureUrl}
                        alt={character.name}
                        className="h-full w-full object-cover"
                      />
                    </span>
                  ) : (
                    <span className="h-16 w-16 rounded-full border border-border bg-panel-alt" />
                  )}
                  <div className="truncate text-sm font-semibold text-text group-hover:text-gold-soft">
                    {character?.name ?? build.roleGbId}
                  </div>
                  <div className="text-xs text-text-muted">Lv {build.characterLevel} / 90</div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

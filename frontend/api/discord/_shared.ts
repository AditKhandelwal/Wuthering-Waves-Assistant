// Shared helpers between interactions.ts (Edge) and build-card.ts (Node) --
// leading underscore, Vercel's own convention for "not a route" files under
// api/. Nothing runtime-specific here: createClient/fetch/FormData/Blob all
// work identically on both Edge and Node, so this one file is safe to
// import from either.
import { createClient } from "@supabase/supabase-js";

// Reuses the frontend's own Supabase project config -- VITE_-prefixed env
// vars are still readable via process.env on the server, since that
// prefix only gates what Vite bundles into the CLIENT build.
export function getAnonClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}

// No site session exists for /builds or /build -- only a Discord
// interaction, verified by its Ed25519 signature instead of a Supabase
// JWT. The service-role key bypasses RLS entirely, so every query made
// with it is deliberately scoped in code (never by raw client input) --
// see database.md's discord_link_codes/discord_links section.
export function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

// The webhook endpoint for editing a deferred response -- no bot token
// needed, the interaction's own token authorizes this, valid for 15
// minutes after the interaction fires.
export function originalMessageUrl(applicationId: string, token: string): string {
  return `https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`;
}

export async function editOriginalText(applicationId: string, token: string, content: string): Promise<void> {
  await fetch(originalMessageUrl(applicationId, token), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

// Wires the image attachment into the embed automatically (`image.url:
// "attachment://<filename>"` is Discord's required convention for
// referencing an uploaded file from within an embed) -- callers only
// need to pass additional embed fields (color, etc.), not that convention
// itself, so it can't be forgotten at a call site.
export async function editOriginalWithImage(
  applicationId: string,
  token: string,
  imageBytes: Uint8Array,
  filename: string,
  embedExtra: Record<string, unknown> = {},
): Promise<void> {
  const embed = { ...embedExtra, image: { url: `attachment://${filename}` } };
  const formData = new FormData();
  formData.append(
    "payload_json",
    JSON.stringify({ embeds: [embed], attachments: [{ id: 0, filename }] }),
  );
  // TS's DOM lib types BlobPart as a non-generic ArrayBufferView, but
  // resvg's asPng() return type is the newer generic
  // Uint8Array<ArrayBufferLike> -- structurally identical at runtime,
  // just a type-modeling mismatch.
  formData.append("files[0]", new Blob([imageBytes] as BlobPart[], { type: "image/png" }), filename);
  await fetch(originalMessageUrl(applicationId, token), { method: "PATCH", body: formData });
}

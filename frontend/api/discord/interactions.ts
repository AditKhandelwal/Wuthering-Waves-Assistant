// Discord's single HTTP interactions endpoint (slash commands, buttons,
// etc. all arrive here as one POST, no persistent Gateway connection --
// see .claude/rules/discord.md for why that's the right shape for this
// app's serverless setup). Vercel Edge runtime, not Node -- verifyKey()
// uses Web Crypto (SubtleCrypto), which Edge supports and Node's classic
// serverless runtime would need a polyfill for; Edge also has a much
// lower cold-start, which matters because Discord requires a response
// within 3 seconds of a command being invoked.
//
// PING/PONG, /link, and /builds verified end-to-end in production.
// /build now triggers build-card.ts (a separate Node function -- see that
// file's header) for the real stats-driven card image; this file only
// does the fast validation (character resolution, link lookup) and
// defers immediately, since the image render can't fit Discord's
// 3-second budget reliably.
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from "discord-interactions";
import { waitUntil } from "@vercel/functions";
import { getAnonClient, getServiceClient, editOriginalText } from "./_shared.js";
// Vercel's build-time type-check reports a TS1543 here (resolves `module`
// as NodeNext for api/ functions regardless of tsconfig.api.json's
// "esnext" setting, which wants an import attribute) -- that's a
// non-fatal diagnostic only. Do NOT add `with { type: "json" }` to
// "fix" it: the actual bundler esbuild uses for api/ functions doesn't
// support that syntax and hard-fails the deploy ("Expected ';' but found
// 'with'") -- confirmed 2026-10-16. Leave this plain; it works.
import characters from "./characters.json";

export const config = { runtime: "edge" };

const SITE_URL = "https://wuthering-waves-assistant.vercel.app";
// No 0/O/1/I -- avoids visual ambiguity when a user retypes the code by hand.
const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface DiscordInteraction {
  type: number;
  application_id: string;
  token: string;
  data?: { name?: string; options?: { name: string; value?: string }[] };
  member?: { user?: { id: string; username: string } };
  user?: { id: string; username: string };
}

// Case-insensitive, exact match first then substring -- same resolution
// order the agent's resolveCharacterId() uses (see agent.md), so a typo- or
// casing-tolerant lookup behaves consistently across both surfaces.
function resolveCharacterId(query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const entries = Object.entries(characters as Record<string, { name: string }>);
  const exact = entries.find(([, c]) => c.name.toLowerCase() === q);
  if (exact) return exact[0];
  const partial = entries.find(([, c]) => c.name.toLowerCase().includes(q));
  return partial ? partial[0] : null;
}

function ephemeralReply(content: string): Response {
  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: InteractionResponseFlags.EPHEMERAL },
  });
}

function deferredReply(): Response {
  return Response.json({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: InteractionResponseFlags.EPHEMERAL },
  });
}

function generateLinkCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => LINK_CODE_ALPHABET[b % LINK_CODE_ALPHABET.length]).join("");
}

async function handleLink(interaction: DiscordInteraction): Promise<Response> {
  const discordUser = interaction.member?.user ?? interaction.user;
  const supabase = getAnonClient();

  if (!discordUser || !supabase) {
    return ephemeralReply("Linking isn't available right now -- try again later.");
  }

  const code = generateLinkCode();
  const { error } = await supabase.from("discord_link_codes").insert({
    code,
    discord_user_id: discordUser.id,
    discord_username: discordUser.username,
  });

  if (error) {
    return ephemeralReply("Couldn't generate a link code -- try again later.");
  }

  return ephemeralReply(`Click to link your account (expires in 10 minutes): ${SITE_URL}/link/${code}`);
}

async function handleBuilds(interaction: DiscordInteraction): Promise<Response> {
  const discordUser = interaction.member?.user ?? interaction.user;
  const supabase = getServiceClient();

  if (!discordUser || !supabase) {
    return ephemeralReply("Something's misconfigured -- try again later.");
  }

  const { data: link } = await supabase
    .from("discord_links")
    .select("user_id")
    .eq("discord_user_id", discordUser.id)
    .maybeSingle();

  if (!link) {
    return ephemeralReply("You haven't linked your account yet -- run /link first.");
  }

  const { data: builds, error } = await supabase
    .from("user_characters")
    .select("role_gb_id, character_level, updated_at")
    .eq("user_id", link.user_id)
    .order("updated_at", { ascending: false });

  if (error) {
    return ephemeralReply("Couldn't load your builds -- try again later.");
  }
  if (!builds || builds.length === 0) {
    return ephemeralReply("No saved builds yet -- go build a character on the site first.");
  }

  const charMap: Record<string, { name: string }> = characters;
  const lines = builds.map((b) => {
    const name = charMap[b.role_gb_id]?.name ?? `Unknown (${b.role_gb_id})`;
    return `• **${name}** — Lv ${b.character_level}/90`;
  });

  return ephemeralReply(lines.join("\n"));
}

// Fires the actual card render off to build-card.ts (a Node function --
// satori/resvg need real Node APIs, see that file's header) and does NOT
// wait for it to finish; that function edits this deferred placeholder
// itself once the image is ready. Protected by a shared-secret header,
// since Discord user ids aren't secret -- without this, anyone could hit
// that endpoint directly and either burn compute or read another linked
// user's build data, bypassing Discord's own signature verification
// entirely.
async function triggerBuildCard(interaction: DiscordInteraction, userId: string, roleGbId: string): Promise<void> {
  const secret = process.env.DISCORD_INTERNAL_SECRET;
  if (!secret) {
    await editOriginalText(
      interaction.application_id,
      interaction.token,
      "Something's misconfigured -- try again later.",
    );
    return;
  }

  await fetch(`${SITE_URL}/api/discord/build-card`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Secret": secret },
    body: JSON.stringify({
      userId,
      roleGbId,
      applicationId: interaction.application_id,
      interactionToken: interaction.token,
    }),
  });
}

async function handleBuild(interaction: DiscordInteraction): Promise<Response> {
  const discordUser = interaction.member?.user ?? interaction.user;
  const characterQuery = interaction.data?.options?.find((o) => o.name === "character")?.value;

  if (!discordUser) {
    return ephemeralReply("Something's misconfigured -- try again later.");
  }
  if (!characterQuery) {
    return ephemeralReply("Usage: /build character:<name>");
  }

  const roleGbId = resolveCharacterId(characterQuery);
  if (!roleGbId) {
    return ephemeralReply(`Couldn't find a character matching "${characterQuery}".`);
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return ephemeralReply("Something's misconfigured -- try again later.");
  }

  const { data: link } = await supabase
    .from("discord_links")
    .select("user_id")
    .eq("discord_user_id", discordUser.id)
    .maybeSingle();

  if (!link) {
    return ephemeralReply("You haven't linked your account yet -- run /link first.");
  }

  waitUntil(triggerBuildCard(interaction, link.user_id, roleGbId));
  return deferredReply();
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  if (!signature || !timestamp || !publicKey) {
    return new Response("Missing signature headers or server misconfigured", { status: 401 });
  }

  // Must verify against the RAW body bytes, before any JSON.parse -- the
  // signature is computed over the exact bytes Discord sent, and even a
  // semantically-identical re-serialization would fail verification.
  const rawBody = await req.text();
  const isValid = await verifyKey(rawBody, signature, timestamp, publicKey);
  if (!isValid) {
    return new Response("Invalid request signature", { status: 401 });
  }

  const interaction = JSON.parse(rawBody);

  if (interaction.type === InteractionType.PING) {
    return Response.json({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    if (interaction.data?.name === "link") return handleLink(interaction);
    if (interaction.data?.name === "builds") return handleBuilds(interaction);
    if (interaction.data?.name === "build") return handleBuild(interaction);
  }

  return ephemeralReply("This command isn't wired up yet.");
}

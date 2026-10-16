// Discord's single HTTP interactions endpoint (slash commands, buttons,
// etc. all arrive here as one POST, no persistent Gateway connection --
// see .claude/rules/discord.md for why that's the right shape for this
// app's serverless setup). Vercel Edge runtime, not Node -- verifyKey()
// uses Web Crypto (SubtleCrypto), which Edge supports and Node's classic
// serverless runtime would need a polyfill for; Edge also has a much
// lower cold-start, which matters because Discord requires a response
// within 3 seconds of a command being invoked.
//
// PING/PONG handshake and /link verified end-to-end in production
// 2026-10-16. /builds and /build are both plain-text replies for now --
// a composed grid image for /builds was tried the same day (see
// discord.md if revisiting) but scrapped to get functionality working
// first. A real Build Card screenshot for /build is the eventual goal,
// same reasoning, not built yet.
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from "discord-interactions";
import { createClient } from "@supabase/supabase-js";
// Vercel's build-time type-check reports a TS1543 here (resolves `module`
// as NodeNext for api/ functions regardless of tsconfig.api.json's
// "esnext" setting, which wants an import attribute) -- that's a
// non-fatal diagnostic only. Do NOT add `with { type: "json" }` to
// "fix" it: the actual bundler esbuild uses for api/ functions doesn't
// support that syntax and hard-fails the deploy ("Expected ';' but found
// 'with'") -- confirmed 2026-10-16. Leave this plain; it works.
import characters from "./characters.json";
import weaponNames from "./weapon_names.json";

export const config = { runtime: "edge" };

const SITE_URL = "https://wuthering-waves-assistant.vercel.app";
// No 0/O/1/I -- avoids visual ambiguity when a user retypes the code by hand.
const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface DiscordInteraction {
  type: number;
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

// Reuses the frontend's own Supabase project config -- VITE_-prefixed env
// vars are still readable via process.env here, since that prefix only
// gates what Vite bundles into the CLIENT build, not what a Vercel
// serverless/edge function can read server-side. No service-role key: this
// client only ever touches discord_link_codes, a short-lived,
// low-sensitivity table with its own permissive RLS policy -- see
// discord.md and database.md.
function getAnonClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}

// /builds and /build have no site session to RLS-scope against at all --
// only a Discord interaction, verified by its Ed25519 signature instead of
// a Supabase JWT. The service-role key bypasses RLS entirely, so every
// query made with it below is deliberately scoped in code: first resolve
// discord_user_id (from the verified interaction payload, unspoofable) to
// a user_id via discord_links, then filter user_characters by that
// resolved user_id -- never by anything else a client could influence. A
// documented, narrow exception to this app's general "no service-role key"
// posture -- see database.md's discord_link_codes/discord_links section.
function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
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

// Plain-text build summary for now -- a rendered Build Card screenshot
// (matching the site's own BuildCard.tsx) is the eventual goal but needs
// either headless Chromium (a separate Node function, Edge can't run it)
// or a composed image, which /builds already tried and scrapped once for
// being real complexity before the simple version even worked. Same
// reasoning applies here: ship the data first.
async function handleBuild(interaction: DiscordInteraction): Promise<Response> {
  const discordUser = interaction.member?.user ?? interaction.user;
  const characterQuery = interaction.data?.options?.find((o) => o.name === "character")?.value;
  const supabase = getServiceClient();

  if (!discordUser || !supabase) {
    return ephemeralReply("Something's misconfigured -- try again later.");
  }
  if (!characterQuery) {
    return ephemeralReply("Usage: /build character:<name>");
  }

  const roleGbId = resolveCharacterId(characterQuery);
  if (!roleGbId) {
    return ephemeralReply(`Couldn't find a character matching "${characterQuery}".`);
  }

  const { data: link } = await supabase
    .from("discord_links")
    .select("user_id")
    .eq("discord_user_id", discordUser.id)
    .maybeSingle();

  if (!link) {
    return ephemeralReply("You haven't linked your account yet -- run /link first.");
  }

  const charName = (characters as Record<string, { name: string }>)[roleGbId]?.name ?? roleGbId;

  const { data: build, error } = await supabase
    .from("user_characters")
    .select("character_level, weapon_gb_id, weapon_level, weapon_rank, resonance_level, talent_levels")
    .eq("user_id", link.user_id)
    .eq("role_gb_id", roleGbId)
    .maybeSingle();

  if (error) {
    return ephemeralReply("Couldn't load that build -- try again later.");
  }
  if (!build) {
    return ephemeralReply(`You haven't saved a build for **${charName}** yet.`);
  }

  const names: Record<string, string> = weaponNames;
  const weaponLine = build.weapon_gb_id
    ? `${names[build.weapon_gb_id] ?? `Unknown (${build.weapon_gb_id})`} (Lv ${build.weapon_level}, Rank ${build.weapon_rank})`
    : "None equipped";

  // addPointTarget order -- see database.md's talent_levels column comment.
  const [normalAttack, resonanceSkill, forteCircuit, resonanceLiberation, introSkill] = build.talent_levels ?? [
    1, 1, 1, 1, 1,
  ];

  const lines = [
    `**${charName}** — Lv ${build.character_level}/90`,
    `Weapon: ${weaponLine}`,
    `Resonance Chain: ${build.resonance_level}/6 unlocked`,
    `Talents: Normal Attack ${normalAttack} | Resonance Skill ${resonanceSkill} | Forte Circuit ${forteCircuit} | Resonance Liberation ${resonanceLiberation} | Intro Skill ${introSkill}`,
  ];

  return ephemeralReply(lines.join("\n"));
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

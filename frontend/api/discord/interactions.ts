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
// 2026-10-16. /builds is back to a plain-text reply -- a composed grid
// image was tried the same day (see discord.md's git history / earlier
// notes if revisiting) but scrapped to get functionality working first;
// revisit the visual version later. /build (the screenshot one) still
// lands on the fallback reply below.
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

export const config = { runtime: "edge" };

const SITE_URL = "https://wuthering-waves-assistant.vercel.app";
// No 0/O/1/I -- avoids visual ambiguity when a user retypes the code by hand.
const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface DiscordInteraction {
  type: number;
  data?: { name?: string };
  member?: { user?: { id: string; username: string } };
  user?: { id: string; username: string };
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
  }

  // /build lands here next.
  return ephemeralReply("This command isn't wired up yet.");
}

// Discord's single HTTP interactions endpoint (slash commands, buttons,
// etc. all arrive here as one POST, no persistent Gateway connection --
// see .claude/rules/discord.md for why that's the right shape for this
// app's serverless setup). Vercel Edge runtime, not Node -- verifyKey()
// uses Web Crypto (SubtleCrypto), which Edge supports and Node's classic
// serverless runtime would need a polyfill for; Edge also has a much
// lower cold-start, which matters because Discord requires a response
// within 3 seconds of a command being invoked.
//
// PING/PONG handshake verified end-to-end in production 2026-10-16 (see
// discord.md). /link is the first real command; /builds and /build still
// land on the fallback reply below.
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from "discord-interactions";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SITE_URL = "https://wuthering-waves-assistant.vercel.app";
// No 0/O/1/I -- avoids visual ambiguity when a user retypes the code by hand.
const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Reuses the frontend's own Supabase project config -- VITE_-prefixed env
// vars are still readable via process.env here, since that prefix only
// gates what Vite bundles into the CLIENT build, not what a Vercel
// serverless/edge function can read server-side. No service-role key: this
// client only ever touches discord_link_codes, a short-lived,
// low-sensitivity table with its own permissive RLS policy -- see
// discord.md and database.md.
function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}

function generateLinkCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => LINK_CODE_ALPHABET[b % LINK_CODE_ALPHABET.length]).join("");
}

async function handleLink(interaction: {
  member?: { user?: { id: string; username: string } };
  user?: { id: string; username: string };
}): Promise<Response> {
  const discordUser = interaction.member?.user ?? interaction.user;
  const supabase = getSupabase();

  if (!discordUser || !supabase) {
    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "Linking isn't available right now -- try again later.",
        flags: InteractionResponseFlags.EPHEMERAL,
      },
    });
  }

  const code = generateLinkCode();
  const { error } = await supabase.from("discord_link_codes").insert({
    code,
    discord_user_id: discordUser.id,
    discord_username: discordUser.username,
  });

  if (error) {
    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "Couldn't generate a link code -- try again later.",
        flags: InteractionResponseFlags.EPHEMERAL,
      },
    });
  }

  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `Click to link your account (expires in 10 minutes): ${SITE_URL}/link/${code}`,
      flags: InteractionResponseFlags.EPHEMERAL,
    },
  });
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

  if (interaction.type === InteractionType.APPLICATION_COMMAND && interaction.data?.name === "link") {
    return handleLink(interaction);
  }

  // /builds and /build land here next.
  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: "This command isn't wired up yet." },
  });
}

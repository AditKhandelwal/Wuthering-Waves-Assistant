// Discord's single HTTP interactions endpoint (slash commands, buttons,
// etc. all arrive here as one POST, no persistent Gateway connection --
// see .claude/rules/discord.md for why that's the right shape for this
// app's serverless setup). Vercel Edge runtime, not Node -- verifyKey()
// uses Web Crypto (SubtleCrypto), which Edge supports and Node's classic
// serverless runtime would need a polyfill for; Edge also has a much
// lower cold-start, which matters because Discord requires a response
// within 3 seconds of a command being invoked.
//
// FIRST MILESTONE (current state): only the PING/PONG verification
// handshake is implemented. Discord refuses to save an Interactions
// Endpoint URL in the dev portal until it round-trips a signed PING
// correctly -- this is the actual thing to test before any real command
// exists. Command dispatch (/link, /builds, /build) is deliberately not
// built yet.
import { InteractionResponseType, InteractionType, verifyKey } from "discord-interactions";

export const config = { runtime: "edge" };

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

  // Real command handling (/link, /builds, /build) lands here next.
  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: "This command isn't wired up yet." },
  });
}

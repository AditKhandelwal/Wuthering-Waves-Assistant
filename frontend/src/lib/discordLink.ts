import { supabase } from "./supabase";

const CODES_TABLE = "discord_link_codes";
const LINKS_TABLE = "discord_links";
const CODE_TTL_MINUTES = 10;

export interface LinkCode {
  code: string;
  discordUserId: string;
  discordUsername: string;
  createdAt: string;
  usedAt: string | null;
}

export type LinkCodeStatus = "valid" | "expired" | "used" | "not_found";

export async function lookupLinkCode(
  code: string,
): Promise<{ status: LinkCodeStatus; linkCode: LinkCode | null }> {
  const { data, error } = await supabase
    .from(CODES_TABLE)
    .select("code, discord_user_id, discord_username, created_at, used_at")
    .eq("code", code)
    .maybeSingle();

  if (error || !data) return { status: "not_found", linkCode: null };

  const linkCode: LinkCode = {
    code: data.code,
    discordUserId: data.discord_user_id,
    discordUsername: data.discord_username,
    createdAt: data.created_at,
    usedAt: data.used_at,
  };

  if (linkCode.usedAt) return { status: "used", linkCode };

  const ageMs = Date.now() - new Date(linkCode.createdAt).getTime();
  if (ageMs > CODE_TTL_MINUTES * 60_000) return { status: "expired", linkCode };

  return { status: "valid", linkCode };
}

export async function confirmLink(userId: string, linkCode: LinkCode): Promise<{ error: string | null }> {
  const { error: linkError } = await supabase.from(LINKS_TABLE).upsert(
    {
      user_id: userId,
      discord_user_id: linkCode.discordUserId,
      discord_username: linkCode.discordUsername,
    },
    { onConflict: "user_id" },
  );
  if (linkError) {
    const message = linkError.message.includes("duplicate key")
      ? "That Discord account is already linked to a different account."
      : linkError.message;
    return { error: message };
  }

  const { error: usedError } = await supabase
    .from(CODES_TABLE)
    .update({ used_at: new Date().toISOString() })
    .eq("code", linkCode.code)
    .is("used_at", null);
  if (usedError) return { error: usedError.message };

  return { error: null };
}

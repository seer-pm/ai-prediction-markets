import { CHAIN_ID } from "@/utils/constants";
import type { Profile } from "@/utils/profile";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

/**
 * Wallet profiles, one row per participant.
 *
 * Same reasoning as the leaderboard boards next door: `key_value` is the generic JSON store this
 * app already uses for chart caches, boards and the owner map, and a dedicated table would mean a
 * hand-applied migration against a Supabase instance shared with Seer — this repo has no
 * migration runner. At a hundred-odd participants the read is a single `.in()`.
 *
 * The key is the *canonical* address (the owner EOA, per `./executorOwners.ts`), so a person who
 * trades through a CREATE2 executor has one profile rather than one per wallet.
 */

export function profileKey(address: string): string {
  return `deep_pm_profile_${CHAIN_ID}_${address.toLowerCase()}`;
}

/** Supabase caps `.in()` payloads; the chart reads chunk at this size for the same reason. */
const READ_CHUNK = 100;

/** Stored profiles for these canonical addresses, keyed by lowercased address. Missing = absent. */
export async function readProfiles(addresses: string[]): Promise<Record<string, Profile>> {
  const unique = [...new Set(addresses.map((address) => address.toLowerCase()))];
  if (unique.length === 0) return {};

  const byKey = new Map(unique.map((address) => [profileKey(address), address]));
  const keys = [...byKey.keys()];
  const profiles: Record<string, Profile> = {};

  for (let i = 0; i < keys.length; i += READ_CHUNK) {
    const { data, error } = await supabase
      .from("key_value")
      .select("key, value")
      .in("key", keys.slice(i, i + READ_CHUNK));
    if (error) throw error;

    for (const row of data ?? []) {
      const address = byKey.get(String(row.key));
      const value = row.value as Profile | undefined;
      if (address && value) profiles[address] = value;
    }
  }

  return profiles;
}

export async function writeProfile(address: string, profile: Profile): Promise<void> {
  const { error } = await supabase
    .from("key_value")
    .upsert({ key: profileKey(address), value: profile }, { onConflict: "key" });
  if (error) throw error;
}

/** How a participant clears their profile: saving all three fields empty removes the row. */
export async function deleteProfile(address: string): Promise<void> {
  const { error } = await supabase.from("key_value").delete().eq("key", profileKey(address));
  if (error) throw error;
}

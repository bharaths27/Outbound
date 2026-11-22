import { createClient } from "@supabase/supabase-js";

export async function getPublicQuest(id: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase connection is not configured");

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.from("quests")
    .select("id,title,description,xp,station:stations(name,neighborhood)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Unable to load quest", { cause: error });
  if (!data) return null;

  const station = Array.isArray(data.station) ? data.station[0] : data.station;
  return { ...data, station };
}

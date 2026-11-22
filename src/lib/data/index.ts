// The only module components import data from. Switch sources with
// NEXT_PUBLIC_DATA_SOURCE=mock|supabase (defaults to mock).

import { mockService } from "./mock";
import { DEMO_ACCOUNTS as MOCK_DEMO_ACCOUNTS } from "./mock/seed";
import type { DataService } from "./service";
import { supabaseService } from "./supabase";
import { SUPABASE_DEMO_ACCOUNTS } from "./supabase/demo";
import type { DemoAccount } from "./types";

const useSupabase = process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase";

export const data: DataService = useSupabase ? supabaseService : mockService;

/** Demo logins for the login screen, matching the active data source. */
export const DEMO_ACCOUNTS: DemoAccount[] = useSupabase ? SUPABASE_DEMO_ACCOUNTS : MOCK_DEMO_ACCOUNTS;

export { parseCheckInError } from "./checkInErrors";
export type { DataService } from "./service";
export type * from "./types";
export { XP_PER_LEVEL, levelProgress } from "./levels";

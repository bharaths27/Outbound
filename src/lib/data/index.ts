// The only module components import data from. Switch sources with
// NEXT_PUBLIC_DATA_SOURCE=mock|supabase (defaults to mock).

import { mockService } from "./mock";
import type { DataService } from "./service";
import { supabaseService } from "./supabase";

export const data: DataService =
  process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase" ? supabaseService : mockService;

export { DEMO_ACCOUNTS } from "./mock/seed";
export { parseCheckInError } from "./checkInErrors";
export type { DataService } from "./service";
export type * from "./types";

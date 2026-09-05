import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.VITE_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { autoRefreshToken: false, persistSession: false } });
async function main() {
  const { error } = await supabase.from("manuscripts").update({ reviews_released_at: new Date().toISOString() }).eq("id", "JMS-2026-DDKPE");
  console.log(error ? error.message : "restored reviews_released_at");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

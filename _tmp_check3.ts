import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.VITE_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { autoRefreshToken: false, persistSession: false } });
async function main() {
  const { data: m } = await supabase.from("manuscripts").select("id,reviews_released_at").ilike("title", "%Noni%").single();
  console.log(m);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

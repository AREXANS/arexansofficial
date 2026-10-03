// Anti-Steal Bot: blocks VPS/bot scrapers, allows Roblox executors.
const ALLOW = /(roblox|wininet|synapse|fluxus|krnl|script-ware|delta|codex|arceus|hydrogen|wave|solara|xeno|swift|awp|seliware|velocity|cryptic|evon|trigon|macsploit|zorara|nezur)/i;
const BOT = /(curl|wget|python|requests|aiohttp|httpx|node|axios|undici|got\/|go-http|java|okhttp|libwww|perl|ruby|php|postman|insomnia|scrapy|bot|spider|crawler|headless|powershell|discord)/i;

export function isBot(req: Request): boolean {
  const ua = req.headers.get("user-agent") || "";
  if (ALLOW.test(ua)) return false;
  if (!ua) return true;
  return BOT.test(ua);
}

export async function botResponse(supabase: any, headers: Record<string, string>): Promise<Response | null> {
  const { data } = await supabase.from("app_settings").select("key,value")
    .in("key", ["antisteal_enabled", "antisteal_mode", "antisteal_custom"]);
  const m: Record<string, string> = {};
  (data || []).forEach((r: any) => (m[r.key] = r.value));
  if (m.antisteal_enabled === "false") return null;
  const mode = m.antisteal_mode || "nil";
  const h = { ...headers, "Content-Type": "text/plain; charset=utf-8" };
  if (mode === "404") return new Response("Not Found", { status: 404, headers: h });
  if (mode === "empty") return new Response("", { status: 200, headers: h });
  if (mode === "custom") return new Response(m.antisteal_custom || "-- nope", { status: 200, headers: h });
  if (mode === "timeout") { await new Promise((r) => setTimeout(r, 25000)); return new Response("", { status: 504, headers: h }); }
  return new Response("return nil", { status: 200, headers: h });
}

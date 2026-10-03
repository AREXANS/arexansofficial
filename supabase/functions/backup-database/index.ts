import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TABLES = [
  "app_settings",
  "packages",
  "ads",
  "backgrounds",
  "transactions",
  "social_links",
  "admin_sessions",
  "lua_scripts",
  "package_discounts",
  "xcoins_balances",
  "xcoins_transactions",
  "xcoins_otp",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const selectedTables = url.searchParams.get("tables")?.split(",").filter(Boolean) || TABLES;

    const backup: Record<string, any[]> = {};
    const errors: string[] = [];

    for (const table of selectedTables) {
      if (!TABLES.includes(table)) {
        errors.push(`Table "${table}" not allowed`);
        continue;
      }

      let allData: any[] = [];
      let from = 0;
      const batchSize = 1000;
      
      while (true) {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .range(from, from + batchSize - 1);

        if (error) {
          errors.push(`${table}: ${error.message}`);
          break;
        }

        if (data && data.length > 0) {
          allData = allData.concat(data);
          if (data.length < batchSize) break;
          from += batchSize;
        } else {
          break;
        }
      }

      backup[table] = allData;
    }

    const result = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      projectId: Deno.env.get("SUPABASE_URL")?.split("//")[1]?.split(".")[0] || "unknown",
      tables: backup,
      tableCounts: Object.fromEntries(Object.entries(backup).map(([k, v]) => [k, v.length])),
      errors: errors.length > 0 ? errors : undefined,
    };

    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

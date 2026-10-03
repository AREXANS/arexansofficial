import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { userId, page = 1, limit = 20 } = await req.json();

    if (!userId) {
      return new Response(JSON.stringify({ error: "User ID required" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get user with fresh balance
    const { data: user } = await supabase.from('xcoins_balances').select('*').eq('id', userId).single();
    if (!user) {
      return new Response(JSON.stringify({ error: "User not found" }), 
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get transactions
    const offset = (page - 1) * limit;
    const { data: transactions, count } = await supabase
      .from('xcoins_transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Get leaderboard (top 10, exclude owner)
    const OWNER_PHONE = '6289518030035';
    const { data: leaderboard } = await supabase
      .from('xcoins_balances')
      .select('id, display_name, phone, balance')
      .eq('is_active', true)
      .neq('phone', OWNER_PHONE)
      .order('balance', { ascending: false })
      .limit(10);

    return new Response(JSON.stringify({
      success: true,
      user: { id: user.id, phone: user.phone, display_name: user.display_name, balance: user.balance },
      transactions: transactions || [],
      totalTransactions: count || 0,
      leaderboard: (leaderboard || []).map((u: any, i: number) => ({
        rank: i + 1,
        display_name: u.display_name,
        phone: u.phone.slice(0, 5) + '****' + u.phone.slice(-3),
        balance: u.balance,
        isMe: u.id === userId
      }))
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

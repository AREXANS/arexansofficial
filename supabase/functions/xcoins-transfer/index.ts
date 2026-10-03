import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new TextDecoder().decode(encode(new Uint8Array(hash)));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { senderId, recipientPhone, amount, pin } = await req.json();

    if (!senderId || !recipientPhone || !amount || !pin) {
      return new Response(JSON.stringify({ error: "Data tidak lengkap" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (amount < 100) {
      return new Response(JSON.stringify({ error: "Minimal transfer 100 XCoins" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify sender
    const { data: sender } = await supabase.from('xcoins_balances').select('*').eq('id', senderId).single();
    if (!sender) {
      return new Response(JSON.stringify({ error: "Pengirim tidak ditemukan" }), 
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify PIN
    const pinHash = await hashPin(pin);
    if (pinHash !== sender.pin_hash) {
      return new Response(JSON.stringify({ error: "PIN salah" }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (sender.balance < amount) {
      return new Response(JSON.stringify({ error: "Saldo tidak cukup" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Find recipient
    let cleanPhone = recipientPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.slice(1);
    if (!cleanPhone.startsWith('62')) cleanPhone = '62' + cleanPhone;

    const { data: recipient } = await supabase.from('xcoins_balances').select('*').eq('phone', cleanPhone).maybeSingle();
    if (!recipient) {
      return new Response(JSON.stringify({ error: "Penerima tidak ditemukan" }), 
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (recipient.id === senderId) {
      return new Response(JSON.stringify({ error: "Tidak bisa transfer ke diri sendiri" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Execute transfer
    const newSenderBalance = sender.balance - amount;
    const newRecipientBalance = recipient.balance + amount;
    const refId = `TRF-${Date.now()}`;

    await supabase.from('xcoins_balances').update({ balance: newSenderBalance, updated_at: new Date().toISOString() }).eq('id', senderId);
    await supabase.from('xcoins_balances').update({ balance: newRecipientBalance, updated_at: new Date().toISOString() }).eq('id', recipient.id);

    // Record transactions
    await supabase.from('xcoins_transactions').insert([
      { user_id: senderId, type: 'transfer_out', amount: -amount, balance_after: newSenderBalance, description: `Transfer ke ${recipient.display_name || cleanPhone}`, reference_id: refId },
      { user_id: recipient.id, type: 'transfer_in', amount: amount, balance_after: newRecipientBalance, description: `Transfer dari ${sender.display_name || sender.phone}`, reference_id: refId }
    ]);

    return new Response(JSON.stringify({ 
      success: true, 
      newBalance: newSenderBalance,
      recipient: { display_name: recipient.display_name, phone: recipient.phone }
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

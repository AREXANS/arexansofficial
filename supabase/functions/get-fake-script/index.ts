import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function generateFakeScript(): string {
  const fakeScripts = [
    `-- Arexans Tools v4.2.1\nlocal HttpService = game:GetService("HttpService")\nlocal function Initialize()\n    print("[Arexans] Initializing...")\n    wait(1)\n    print("[Arexans] Loading UI...")\n    wait(0.5)\n    print("[Arexans] Connecting...")\n    wait(1.5)\n    for i = 1, 3 do\n        print("[Arexans] Verification attempt " .. i .. "/3...")\n        wait(1)\n    end\n    warn("[Arexans] ERROR: Session verification failed")\n    warn("[Arexans] Error Code: AX-" .. math.random(1000, 9999))\nend\nInitialize()`,
    `-- Protected Script Container\nlocal Security = {}\nSecurity.__index = Security\nfunction Security.new()\n    local self = setmetatable({}, Security)\n    self.validated = false\n    self.attempts = 0\n    return self\nend\nfunction Security:validate()\n    self.attempts = self.attempts + 1\n    print("[Security] Validating... (attempt " .. self.attempts .. ")")\n    wait(1.5)\n    if self.attempts > 2 then\n        warn("[Security] Too many attempts")\n        return false\n    end\n    wait(2)\n    warn("[Security] License validation failed")\n    return false\nend\nlocal sec = Security.new()\nif not sec:validate() then return end`
  ];
  return fakeScripts[Math.floor(Math.random() * fakeScripts.length)];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    return new Response(generateFakeScript(), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(`-- Error: ${errorMessage}`, { status: 500, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
  }
});
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const MODES = [
  { v: "nil", l: "return nil" },
  { v: "empty", l: "Kosong" },
  { v: "custom", l: "Teks custom" },
  { v: "timeout", l: "Timeout" },
  { v: "404", l: "404" },
];

export default function AntiStealSettings() {
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState("nil");
  const [custom, setCustom] = useState("");

  useEffect(() => {
    supabase.from("app_settings").select("key,value")
      .in("key", ["antisteal_enabled", "antisteal_mode", "antisteal_custom"])
      .then(({ data }) => (data || []).forEach((r) => {
        if (r.key === "antisteal_enabled") setEnabled(r.value !== "false");
        if (r.key === "antisteal_mode") setMode(r.value);
        if (r.key === "antisteal_custom") setCustom(r.value);
      }));
  }, []);

  const save = async (k: string, v: string) => {
    await supabase.from("app_settings").delete().eq("key", k);
    const { error } = await supabase.from("app_settings").insert({ key: k, value: v });
    if (error) toast.error("Gagal menyimpan"); else toast.success("Tersimpan");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Anti-Steal Bot</CardTitle>
        <div className="flex items-center gap-2 text-sm">
          {enabled ? "Aktif" : "Tutup"}
          <Switch checked={enabled} onCheckedChange={(c) => { setEnabled(c); save("antisteal_enabled", String(c)); }} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Respon untuk bot (VPS, curl, python, dll). Executor Roblox tetap berjalan normal.</p>
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <Button key={m.v} size="sm" variant={mode === m.v ? "default" : "outline"}
              onClick={() => { setMode(m.v); save("antisteal_mode", m.v); }}>{m.l}</Button>
          ))}
        </div>
        {mode === "custom" && (
          <div className="flex gap-2">
            <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder='print("nice try")' />
            <Button size="sm" onClick={() => save("antisteal_custom", custom)}>Simpan</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { FC, useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import {
  Film,
  Download,
  Trash2,
  RefreshCw,
  Search,
  Copy,
  Gamepad2,
  User,
  Clock,
  Database,
  ExternalLink,
  Code2,
} from 'lucide-react';

export interface LuaRecording {
  id: string;
  game_id: string | null;
  title: string;
  owner_roblox_id: string | null;
  owner_username: string | null;
  is_public: boolean;
  recording_data: unknown;
  created_at: string;
  updated_at: string;
  owned?: boolean;
}

export const MainLuaRecordings: FC = () => {
  const [recordings, setRecordings] = useState<LuaRecording[]>([]);
  const [recordingKey, setRecordingKey] = useState('');
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [recordingSearch, setRecordingSearch] = useState('');
  const [gameNames, setGameNames] = useState<Record<string, string>>({});
  const recordingKeyRef = useRef(recordingKey);

  const SUPABASE_API_BASE = '/functions/v1';

  useEffect(() => {
    recordingKeyRef.current = recordingKey;
  }, [recordingKey]);

  useEffect(() => {
    fetchRecordings();

    const channel = supabase
      .channel('lua-recording-events-dedicated')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lua_recording_events' },
        () => {
          fetchRecordings(true);
        }
      )
      .subscribe();

    const timer = window.setInterval(() => fetchRecordings(true), 15000);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(timer);
    };
  }, [recordingKey]);

  const resolveGameName = async (placeId: string) => {
    setGameNames((prev) =>
      prev[placeId] && prev[placeId] !== `Place ${placeId}`
        ? prev
        : { ...prev, [placeId]: prev[placeId] || '…' }
    );
    const attempts: Array<() => Promise<string | null>> = [
      async () => {
        const r = await fetch(
          `https://apis.roproxy.com/universes/v1/places/${placeId}/universe`
        );
        if (!r.ok) return null;
        const j = await r.json();
        const uid = j?.universeId;
        if (!uid) return null;
        const g = await fetch(`https://games.roproxy.com/v1/games?universeIds=${uid}`);
        if (!g.ok) return null;
        const gj = await g.json();
        return gj?.data?.[0]?.name || gj?.data?.[0]?.sourceName || null;
      },
      async () => {
        const r = await fetch(`https://economy.roproxy.com/v2/assets/${placeId}/details`);
        if (!r.ok) return null;
        const j = await r.json();
        return j?.Name || null;
      },
    ];
    for (const run of attempts) {
      try {
        const name = await run();
        if (name) {
          setGameNames((prev) => ({ ...prev, [placeId]: name }));
          return;
        }
      } catch {
        /* try next */
      }
    }
    setGameNames((prev) => ({ ...prev, [placeId]: `Place ${placeId}` }));
  };

  const fetchRecordings = async (silent = false) => {
    const activeKey = recordingKeyRef.current.trim();
    const scope = activeKey ? 'all' : 'public';

    if (!silent) setRecordingsLoading(true);
    try {
      const params = new URLSearchParams({ scope, limit: '100' });
      if (activeKey) params.set('key', activeKey);
      const res = await fetch(`${SUPABASE_API_BASE}/sync-recordings?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Gagal mengambil rekaman');
      const list: LuaRecording[] = json.recordings || [];
      setRecordings(list);

      const uniqueIds = Array.from(
        new Set(
          list
            .map((r) => r.game_id)
            .filter((v): v is string => !!v && /^\d+$/.test(v))
        )
      );
      uniqueIds.forEach((id) => {
        const cur = gameNames[id];
        if (!cur || cur === `Place ${id}`) resolveGameName(id);
      });
    } catch (error) {
      if (!silent)
        toast({
          title: 'Error',
          description:
            error instanceof Error ? error.message : 'Gagal mengambil rekaman',
          variant: 'destructive',
        });
    } finally {
      if (!silent) setRecordingsLoading(false);
    }
  };

  const gameNameFor = (id: string | null) => {
    if (!id) return 'All game';
    if (/^\d+$/.test(id)) return gameNames[id] || `Place ${id}`;
    return id;
  };

  const filteredRecordings = recordings.filter((r) => {
    const q = recordingSearch.trim().toLowerCase();
    if (!q) return true;
    const gname = gameNameFor(r.game_id).toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      (r.owner_username || '').toLowerCase().includes(q) ||
      gname.includes(q) ||
      (r.game_id || '').toLowerCase().includes(q)
    );
  });

  const copyRecordingData = async (recording: LuaRecording) => {
    await navigator.clipboard.writeText(JSON.stringify(recording.recording_data, null, 2));
    toast({
      title: 'Copied!',
      description: `Data rekaman "${recording.title}" berhasil disalin`,
    });
  };

  const downloadRecordingFile = (recording: LuaRecording) => {
    const dataStr = JSON.stringify(recording.recording_data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fileName = /\.json$/i.test(recording.title) ? recording.title : `${recording.title}.json`;
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: 'File Didownload',
      description: `Menyimpan ${fileName}`,
    });
  };

  const deleteRecording = async (recording: LuaRecording) => {
    if (!confirm(`Hapus rekaman "${recording.title}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      const activeKey = recordingKeyRef.current.trim();
      if (activeKey && recording.owned) {
        const res = await fetch(`${SUPABASE_API_BASE}/sync-recordings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', key: activeKey, id: recording.id }),
        });
        const j = await res.json();
        if (res.ok && j.success) {
          toast({ title: 'Berhasil', description: 'Rekaman dihapus' });
          fetchRecordings(true);
          return;
        }
      }

      const { data: adminRow } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'admin_key')
        .maybeSingle();
      const adminKey = adminRow?.value;
      if (!adminKey) throw new Error('Admin key tidak tersedia');
      const res = await fetch(`${SUPABASE_API_BASE}/sync-recordings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'admin_delete', adminKey, id: recording.id }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Gagal hapus');
      toast({ title: 'Berhasil', description: 'Rekaman dihapus (admin)' });
      fetchRecordings(true);
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Gagal menghapus rekaman',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="glass-card border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-lg font-display font-semibold flex items-center gap-2">
                <Film className="w-5 h-5 text-primary" />
                Manajemen Rekaman Main Lua
                <Badge variant="outline" className="text-xs text-primary border-primary/30">
                  {recordings.length} Rekaman
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Data rekaman runtime diekspor langsung dari script Roblox dan tersinkronisasi realtime.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchRecordings()}
              disabled={recordingsLoading}
              className="text-xs h-8 self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${recordingsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <Input
              value={recordingKey}
              onChange={(e) => setRecordingKey(e.target.value)}
              placeholder="Filter AXS Key (opsional, untuk melihat rekaman private milik key tertentu)..."
              className="font-mono text-xs bg-black/30"
            />
            {recordingKey && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-9"
                onClick={() => setRecordingKey('')}
              >
                Reset Filter Key
              </Button>
            )}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={recordingSearch}
              onChange={(e) => setRecordingSearch(e.target.value)}
              placeholder="Cari berdasarkan judul rekaman, nama game/place ID, atau username Roblox..."
              className="pl-8 text-xs bg-black/30"
            />
          </div>

          <ScrollArea className="h-[520px] rounded-lg border border-primary/20 bg-black/20 p-3">
            {filteredRecordings.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <Database className="w-10 h-10 text-muted-foreground/40 mx-auto" />
                <p className="text-sm font-medium text-muted-foreground">
                  {recordings.length === 0 ? 'Belum ada rekaman tersimpan' : 'Tidak ada rekaman yang cocok dengan pencarian'}
                </p>
                <p className="text-xs text-muted-foreground/70 max-w-sm mx-auto">
                  Rekaman akan otomatis muncul di sini saat user mengekspor rekaman dari Main Lua di dalam game.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredRecordings.map((recording) => {
                  const gname = gameNameFor(recording.game_id);
                  const placeId =
                    recording.game_id && /^\d+$/.test(recording.game_id)
                      ? recording.game_id
                      : null;
                  const fileName = /\.json$/i.test(recording.title)
                    ? recording.title
                    : `${recording.title}.json`;

                  return (
                    <div
                      key={recording.id}
                      className="rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 p-3 text-xs transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                            <Gamepad2 className="w-3 h-3 mr-1 text-primary" />
                            {gname}
                            {placeId && <span className="opacity-60 ml-1">({placeId})</span>}
                          </Badge>
                          {recording.owned && (
                            <Badge className="bg-secondary/20 text-secondary text-[10px] border-secondary/30">
                              Milik Sendiri
                            </Badge>
                          )}
                          <span className="font-semibold text-foreground truncate text-sm">
                            {fileName}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap pt-0.5">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3 text-primary/70" />
                            {recording.owner_username || 'Unknown'}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(recording.updated_at).toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 self-end sm:self-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs"
                          onClick={() => copyRecordingData(recording)}
                          title="Salin isi data JSON rekaman"
                        >
                          <Copy className="w-3.5 h-3.5 mr-1" />
                          Salin
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs"
                          onClick={() => downloadRecordingFile(recording)}
                          title="Download file .json rekaman"
                        >
                          <Download className="w-3.5 h-3.5 mr-1" />
                          Download
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-destructive hover:bg-destructive/20 hover:text-destructive"
                          onClick={() => deleteRecording(recording)}
                          title="Hapus rekaman"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default MainLuaRecordings;

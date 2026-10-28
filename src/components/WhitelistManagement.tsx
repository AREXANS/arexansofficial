import { FC, useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { 
  Shield, Plus, Trash2, RefreshCw, Users, Copy, Search,
  CheckCircle, XCircle, User, Upload, FileCode, Eye, EyeOff, Code
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import LoadstringDurationDialog, { LoadstringDialogConfig } from '@/components/LoadstringDurationDialog';

interface WhitelistUser {
  username: string;
  addedAt: string;
  addedBy: 'manual' | 'key';
  keyRef?: string;
  fullKey?: string;
  ipAddress?: string;
}

interface KeyData {
  key: string;
  expired: string;
  role: string;
  maxHwid: number;
  frozenUntil: string | null;
  hwids: string[];
  robloxUsers: { hwid: string; username: string; registeredAt: string }[];
}

interface UploadedScript {
  id: string;
  name: string;
  display_name: string;
  content: string;
  rawContent: string;
  useWhitelist: boolean;
  is_active: boolean;
  created_at: string;
}

const WhitelistManagement: FC = () => {
  const [manualWhitelist, setManualWhitelist] = useState<WhitelistUser[]>([]);
  const [keyWhitelist, setKeyWhitelist] = useState<WhitelistUser[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadedScripts, setUploadedScripts] = useState<UploadedScript[]>([]);
  const [loadstringDialogConfig, setLoadstringDialogConfig] = useState<LoadstringDialogConfig | null>(null);
  const [showLoadstringDialog, setShowLoadstringDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const SUPABASE_API_BASE = `${currentOrigin}/functions/v1`;

  const generateWhitelistWrapper = (rawScript: string) => {
    return `-- Whitelist Protected Script
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")

local WHITELIST_URL = "${SUPABASE_API_BASE}/get-whitelist?format=json"
local whitelistedUsers = {}

local function fetchWhitelist()
    local ok, result = pcall(function()
        local response = game:HttpGet(WHITELIST_URL)
        local data = HttpService:JSONDecode(response)
        if data and data.usernames then
            whitelistedUsers = {}
            for _, name in ipairs(data.usernames) do
                whitelistedUsers[string.lower(name)] = true
            end
        end
    end)
    if not ok then warn("[Whitelist] Failed to fetch: " .. tostring(result)) end
end

local function isWhitelisted(player)
    return whitelistedUsers[string.lower(player.Name)] == true
end

fetchWhitelist()

local player = Players.LocalPlayer
if not isWhitelisted(player) then
    warn("[Whitelist] " .. player.Name .. " is NOT whitelisted!")
    return
end

print("[Whitelist] " .. player.Name .. " verified! Loading script...")

-- Original Script Below --
${rawScript}`;
  };

  const fetchScripts = async () => {
    const { data } = await supabase
      .from('lua_scripts')
      .select('*')
      .eq('script_type', 'whitelist_upload')
      .order('created_at', { ascending: false });
    
    if (data) {
      setUploadedScripts(data.map((s: any) => ({
        id: s.id,
        name: s.name,
        display_name: s.display_name,
        content: s.content,
        rawContent: s.description || s.content,
        useWhitelist: s.content.startsWith('-- Whitelist Protected Script'),
        is_active: true,
        created_at: s.created_at
      })));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'lua' && ext !== 'txt') {
      toast({ title: 'Error', description: 'Hanya file .lua atau .txt', variant: 'destructive' });
      return;
    }

    const rawContent = await file.text();
    const displayName = file.name.replace(/\.(lua|txt)$/, '');
    const scriptName = displayName.toLowerCase().replace(/[^a-z0-9]/g, '_');

    const { error } = await supabase.from('lua_scripts').insert({
      name: scriptName,
      display_name: displayName,
      content: rawContent,
      description: rawContent,
      script_type: 'whitelist_upload',
      is_active: true
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Berhasil', description: `Script "${displayName}" berhasil diupload` });
      fetchScripts();
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleWhitelist = async (script: UploadedScript) => {
    const newVal = !script.useWhitelist;
    const newContent = newVal ? generateWhitelistWrapper(script.rawContent) : script.rawContent;
    
    await supabase.from('lua_scripts').update({
      content: newContent,
      updated_at: new Date().toISOString()
    }).eq('id', script.id);

    toast({ title: 'Berhasil', description: newVal ? 'Whitelist diaktifkan' : 'Whitelist dinonaktifkan' });
    fetchScripts();
  };

  const deleteScript = async (id: string) => {
    if (!confirm('Yakin hapus script ini?')) return;
    await supabase.from('lua_scripts').delete().eq('id', id);
    toast({ title: 'Berhasil', description: 'Script dihapus' });
    fetchScripts();
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied!', description: `${label} berhasil disalin` });
  };

  const getScriptRuntimeUrl = (scriptName: string) =>
    `${SUPABASE_API_BASE}/get-script?name=${encodeURIComponent(scriptName)}&raw=1`;

  const getScriptLoadstring = (scriptName: string) =>
    `loadstring(game:HttpGet("${getScriptRuntimeUrl(scriptName)}"))()`;

  const fetchWhitelist = async () => {
    setLoading(true);
    try {
      const { data: manualData } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'manual_whitelist')
        .single();

      if (manualData?.value) {
        try {
          setManualWhitelist(JSON.parse(manualData.value));
        } catch {
          setManualWhitelist([]);
        }
      }

      const { data: keysData } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'license_keys')
        .single();

      if (keysData?.value) {
        try {
          const keys: KeyData[] = JSON.parse(keysData.value);
          const now = new Date();
          const keyUsers: WhitelistUser[] = [];

          // Fetch transactions to map license_key -> ip_address
          const { data: txData } = await supabase
            .from('transactions')
            .select('license_key, ip_address, paid_at')
            .not('license_key', 'is', null)
            .not('ip_address', 'is', null)
            .order('paid_at', { ascending: false });

          const ipByKey: Record<string, string> = {};
          (txData || []).forEach((tx: any) => {
            if (tx.license_key && tx.ip_address && !ipByKey[tx.license_key]) {
              ipByKey[tx.license_key] = tx.ip_address;
            }
          });

          keys.forEach(keyData => {
            const expiredDate = new Date(keyData.expired);
            if (expiredDate >= now && !keyData.frozenUntil && keyData.robloxUsers) {
              keyData.robloxUsers.forEach(user => {
                if (user.username) {
                  keyUsers.push({
                    username: user.username,
                    addedAt: user.registeredAt,
                    addedBy: 'key',
                    keyRef: keyData.key.slice(0, 8) + '...',
                    fullKey: keyData.key,
                    ipAddress: ipByKey[keyData.key]
                  });
                }
              });
            }
          });

          setKeyWhitelist(keyUsers);
        } catch {
          setKeyWhitelist([]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch whitelist:', error);
      toast({ title: 'Error', description: 'Gagal mengambil data whitelist', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWhitelist();
    fetchScripts();
  }, []);

  const handleAddUsername = async () => {
    if (!newUsername.trim()) {
      toast({ title: 'Error', description: 'Username tidak boleh kosong', variant: 'destructive' });
      return;
    }

    const allUsernames = [...manualWhitelist, ...keyWhitelist].map(u => u.username.toLowerCase());
    if (allUsernames.includes(newUsername.toLowerCase().trim())) {
      toast({ title: 'Error', description: 'Username sudah ada di whitelist', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const newUser: WhitelistUser = {
        username: newUsername.trim(),
        addedAt: new Date().toISOString(),
        addedBy: 'manual'
      };

      const updatedList = [...manualWhitelist, newUser];

      const { data: existing } = await supabase
        .from('app_settings')
        .select('id')
        .eq('key', 'manual_whitelist')
        .single();

      if (existing) {
        await supabase
          .from('app_settings')
          .update({ 
            value: JSON.stringify(updatedList),
            updated_at: new Date().toISOString()
          })
          .eq('key', 'manual_whitelist');
      } else {
        await supabase
          .from('app_settings')
          .insert({
            key: 'manual_whitelist',
            value: JSON.stringify(updatedList),
            description: 'Manual whitelist usernames for Roblox'
          });
      }

      setManualWhitelist(updatedList);
      setNewUsername('');
      toast({ title: 'Berhasil', description: `Username "${newUsername}" ditambahkan ke whitelist` });
    } catch (error) {
      console.error('Failed to add username:', error);
      toast({ title: 'Error', description: 'Gagal menambahkan username', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveUsername = async (username: string) => {
    setSaving(true);
    try {
      const updatedList = manualWhitelist.filter(u => u.username !== username);

      await supabase
        .from('app_settings')
        .update({ 
          value: JSON.stringify(updatedList),
          updated_at: new Date().toISOString()
        })
        .eq('key', 'manual_whitelist');

      setManualWhitelist(updatedList);
      toast({ title: 'Berhasil', description: `Username "${username}" dihapus dari whitelist` });
    } catch (error) {
      console.error('Failed to remove username:', error);
      toast({ title: 'Error', description: 'Gagal menghapus username', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const copyWhitelistUrl = (format: string) => {
    const url = `${SUPABASE_API_BASE}/get-whitelist?format=${format}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Copied!', description: `URL whitelist (${format}) berhasil disalin` });
  };

  const allWhitelist = [...manualWhitelist, ...keyWhitelist];
  const filteredWhitelist = allWhitelist.filter(u => 
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-xl font-display font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500 flex-shrink-0" />
            <span className="truncate">Whitelist Management</span>
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Kelola username Roblox yang di-whitelist
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchWhitelist} disabled={loading} className="flex-shrink-0">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline ml-2">Refresh</span>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="glass-card p-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-bold">{allWhitelist.length}</p>
            </div>
          </div>
        </Card>
        <Card className="glass-card p-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-yellow-500" />
            <div>
              <p className="text-xs text-muted-foreground">Manual</p>
              <p className="text-lg font-bold">{manualWhitelist.length}</p>
            </div>
          </div>
        </Card>
        <Card className="glass-card p-3 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-secondary" />
            <div>
              <p className="text-xs text-muted-foreground">Dari Key</p>
              <p className="text-lg font-bold">{keyWhitelist.length}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Add Username */}
      <Card className="glass-card">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Tambah Username Manual
          </CardTitle>
          <CardDescription className="text-xs">
            Tambahkan username Roblox ke whitelist secara manual
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <div className="flex gap-2">
            <Input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Masukkan username Roblox..."
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleAddUsername()}
            />
            <Button onClick={handleAddUsername} disabled={saving || !newUsername.trim()}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span className="hidden sm:inline ml-2">Tambah</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Whitelist Users */}
      <Card className="glass-card">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Daftar Whitelist ({allWhitelist.length})
              </CardTitle>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari username..."
                className="pl-9 w-full sm:w-48"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {filteredWhitelist.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <XCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Tidak ada username di whitelist</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px] pr-2">
              <div className="space-y-2">
                {filteredWhitelist.map((user, idx) => (
                  <div
                    key={`${user.username}-${idx}`}
                    className="flex items-center justify-between p-2 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm truncate">{user.username}</p>
                          {user.ipAddress && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                              {user.ipAddress}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge 
                            variant={user.addedBy === 'manual' ? 'default' : 'secondary'} 
                            className="text-[10px] px-1.5 py-0"
                          >
                            {user.addedBy === 'manual' ? 'Manual' : 'Key'}
                          </Badge>
                          {user.keyRef && (
                            <span className="text-[10px] text-muted-foreground">{user.keyRef}</span>
                          )}
                          {user.addedBy === 'key' && !user.ipAddress && (
                            <span className="text-[10px] text-muted-foreground italic">no IP</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {user.addedBy === 'manual' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveUsername(user.username)}
                        className="text-destructive hover:text-destructive flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Script Upload */}
      <Card className="glass-card">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            Upload Script Lua
          </CardTitle>
          <CardDescription className="text-xs">
            Upload file .lua/.txt, opsional aktifkan whitelist protection
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 space-y-3">
          <div className="flex gap-2">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".lua,.txt"
              onChange={handleFileUpload}
              className="flex-1"
            />
          </div>

          {uploadedScripts.length > 0 && (
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {uploadedScripts.map(script => (
                  <div key={script.id} className="p-3 rounded-lg bg-muted/30 border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileCode className="w-4 h-4 text-primary" />
                        <span className="font-medium text-sm">{script.display_name}</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => deleteScript(script.id)} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={script.useWhitelist}
                        onCheckedChange={() => toggleWhitelist(script)}
                      />
                      <span className="text-xs text-muted-foreground">
                        {script.useWhitelist ? '🛡️ Whitelist Aktif' : 'Whitelist Nonaktif'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => copyText(script.rawContent, 'Source code asli')}>
                        <Code className="w-3 h-3 mr-1" />
                        Salin Asli
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => copyText(script.useWhitelist ? script.content : generateWhitelistWrapper(script.rawContent), 'Source code + whitelist')}>
                        <Shield className="w-3 h-3 mr-1" />
                        Salin + Whitelist
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => copyText(getScriptRuntimeUrl(script.name), 'URL')}>
                        <Copy className="w-3 h-3 mr-1" />
                        Salin URL
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setLoadstringDialogConfig({
                            scriptName: script.display_name,
                            rawLoadstring: getScriptLoadstring(script.name),
                            sourceUrl: getScriptRuntimeUrl(script.name),
                          });
                          setShowLoadstringDialog(true);
                        }}
                      >
                        <FileCode className="w-3 h-3 mr-1" />
                        Salin Loadstring
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* API Endpoints */}
      <Card className="glass-card">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <Copy className="w-4 h-4 text-primary" />
            API Endpoints
          </CardTitle>
          <CardDescription className="text-xs">
            URL untuk mengakses whitelist dari Roblox
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 px-3 sm:px-6">
          <div className="grid gap-2">
            {['json', 'lua', 'raw'].map(format => (
              <div key={format} className="flex items-center gap-2">
                <Input
                  readOnly
                  value={`${SUPABASE_API_BASE}/get-whitelist?format=${format}`}
                  className="font-mono text-xs flex-1"
                />
                <Button variant="outline" size="sm" onClick={() => copyWhitelistUrl(format)}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <LoadstringDurationDialog
        open={showLoadstringDialog}
        onOpenChange={setShowLoadstringDialog}
        config={loadstringDialogConfig}
      />
    </div>
  );
};

export default WhitelistManagement;

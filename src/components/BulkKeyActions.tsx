import { FC, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { 
  Clock, CheckSquare, Square, Trash2, RefreshCw
} from 'lucide-react';

interface KeyItem {
  key: string;
  expired: string;
  role: string;
  maxHwid: number;
  frozenUntil: string | null;
  frozenRemainingMs?: number;
  hwids: string[];
  robloxUsers: {
    hwid: string;
    username: string;
    registeredAt: string;
  }[];
}

interface BulkKeyActionsProps {
  keys: KeyItem[];
  selectedKeys: Set<string>;
  onSelectionChange: (keys: Set<string>) => void;
  onRefresh: () => void;
}

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const TIME_UNITS: Record<string, number> = {
  'm': 60 * 1000,
  'j': 60 * 60 * 1000,
  'h': 24 * 60 * 60 * 1000,
  'b': 30 * 24 * 60 * 60 * 1000,
  't': 365 * 24 * 60 * 60 * 1000,
  'menit': 60 * 1000,
  'jam': 60 * 60 * 1000,
  'hari': 24 * 60 * 60 * 1000,
  'bulan': 30 * 24 * 60 * 60 * 1000,
  'tahun': 365 * 24 * 60 * 60 * 1000,
  'min': 60 * 1000,
  'hr': 60 * 60 * 1000,
  'd': 24 * 60 * 60 * 1000,
  'mo': 30 * 24 * 60 * 60 * 1000,
  'y': 365 * 24 * 60 * 60 * 1000,
};

const parseTimeInput = (input: string): { ms: number; isRelative: boolean; isAdd: boolean } => {
  const trimmed = input.trim();
  let isAdd = true;
  let isRelative = false;
  let workingInput = trimmed;

  if (workingInput.startsWith('+')) {
    isRelative = true;
    isAdd = true;
    workingInput = workingInput.substring(1).trim();
  } else if (workingInput.startsWith('-')) {
    isRelative = true;
    isAdd = false;
    workingInput = workingInput.substring(1).trim();
  }

  const parts = workingInput.split(/[,\s]+/).filter(p => p.length > 0);
  let totalMs = 0;
  
  for (const part of parts) {
    const match = part.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      const multiplier = TIME_UNITS[unit];
      if (multiplier) {
        totalMs += value * multiplier;
      }
    }
  }

  return { ms: totalMs, isRelative, isAdd };
};

const formatMsToReadable = (ms: number): string => {
  if (ms <= 0) return '0';
  
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  
  const parts = [];
  if (days > 0) parts.push(`${days} hari`);
  if (hours > 0) parts.push(`${hours} jam`);
  if (minutes > 0) parts.push(`${minutes} menit`);
  
  return parts.join(' ') || '0 menit';
};

const BulkKeyActions: FC<BulkKeyActionsProps> = ({ 
  keys, 
  selectedKeys, 
  onSelectionChange,
  onRefresh 
}) => {
  const [bulkTimeInput, setBulkTimeInput] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleSelectAll = () => {
    if (selectedKeys.size === keys.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(keys.map(k => k.key)));
    }
  };

  const toggleKeySelection = (key: string) => {
    const newSelection = new Set(selectedKeys);
    if (newSelection.has(key)) {
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }
    onSelectionChange(newSelection);
  };

  const applyBulkTimeAdjustment = async () => {
    if (selectedKeys.size === 0) {
      toast({ title: 'Error', description: 'Pilih setidaknya satu key', variant: 'destructive' });
      return;
    }

    if (!bulkTimeInput.trim()) {
      toast({ title: 'Error', description: 'Masukkan format waktu', variant: 'destructive' });
      return;
    }

    const parsed = parseTimeInput(bulkTimeInput);
    if (parsed.ms === 0) {
      toast({ title: 'Error', description: 'Format waktu tidak valid', variant: 'destructive' });
      return;
    }

    const confirmMsg = `${parsed.isAdd ? 'Tambah' : 'Kurangi'} ${formatMsToReadable(parsed.ms)} ke ${selectedKeys.size} key?`;
    if (!confirm(confirmMsg)) return;

    setLoading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const keyName of selectedKeys) {
      const keyItem = keys.find(k => k.key === keyName);
      if (!keyItem) continue;

      try {
        const currentExpiry = new Date(keyItem.expired);
        let newExpiry: Date;

        if (parsed.isRelative) {
          if (parsed.isAdd) {
            newExpiry = new Date(currentExpiry.getTime() + parsed.ms);
          } else {
            newExpiry = new Date(currentExpiry.getTime() - parsed.ms);
          }
        } else {
          newExpiry = new Date(Date.now() + parsed.ms);
        }

        const response = await fetch(`${API_BASE}/update-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: keyName,
            expired: newExpiry.toISOString()
          })
        });

        const result = await response.json();
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    toast({
      title: 'Bulk Update Selesai',
      description: `${successCount} berhasil, ${errorCount} gagal`,
      variant: errorCount > 0 ? 'destructive' : 'default'
    });

    setBulkTimeInput('');
    onSelectionChange(new Set());
    onRefresh();
    setLoading(false);
  };

  const deleteSelectedKeys = async () => {
    if (selectedKeys.size === 0) {
      toast({ title: 'Error', description: 'Pilih setidaknya satu key', variant: 'destructive' });
      return;
    }

    if (!confirm(`Hapus ${selectedKeys.size} key yang dipilih?`)) return;

    setLoading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const keyName of selectedKeys) {
      try {
        const response = await fetch(`${API_BASE}/delete-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: keyName })
        });

        const result = await response.json();
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    toast({
      title: 'Bulk Delete Selesai',
      description: `${successCount} berhasil dihapus, ${errorCount} gagal`,
      variant: errorCount > 0 ? 'destructive' : 'default'
    });

    onSelectionChange(new Set());
    onRefresh();
    setLoading(false);
  };

  if (keys.length === 0) return null;

  return (
    <Card className="glass-card border-yellow-500/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-yellow-400" />
            <CardTitle className="text-base">Bulk Actions</CardTitle>
          </div>
          <span className="text-sm text-muted-foreground">
            {selectedKeys.size} dari {keys.length} dipilih
          </span>
        </div>
        <CardDescription>
          Pilih beberapa key untuk mengubah expired secara massal
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={toggleSelectAll}
            className="border-yellow-500/50"
          >
            {selectedKeys.size === keys.length ? (
              <>
                <Square className="w-4 h-4 mr-2" />
                Batal Pilih Semua
              </>
            ) : (
              <>
                <CheckSquare className="w-4 h-4 mr-2" />
                Pilih Semua ({keys.length})
              </>
            )}
          </Button>
          {selectedKeys.size > 0 && (
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={deleteSelectedKeys}
              disabled={loading}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Hapus ({selectedKeys.size})
            </Button>
          )}
        </div>

        {selectedKeys.size > 0 && (
          <div className="space-y-2 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
            <Label className="flex items-center gap-2 text-yellow-400">
              <Clock className="w-4 h-4" />
              Adjust Expired untuk {selectedKeys.size} key
            </Label>
            <div className="flex gap-2">
              <Input
                value={bulkTimeInput}
                onChange={(e) => setBulkTimeInput(e.target.value)}
                placeholder="Contoh: + 7h, - 1b, 30h"
                className="bg-background/50 font-mono flex-1"
              />
              <Button 
                onClick={applyBulkTimeAdjustment} 
                disabled={loading || !bulkTimeInput.trim()}
                className="bg-yellow-500 hover:bg-yellow-600 text-black"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Apply'}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-xs text-muted-foreground mr-1">Quick:</span>
              {[
                { label: '+7h', value: '+ 7h' },
                { label: '+1b', value: '+ 1b' },
                { label: '+1t', value: '+ 1t' },
                { label: '-7h', value: '- 7h' },
                { label: '-1b', value: '- 1b' },
              ].map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setBulkTimeInput(value)}
                  className="px-2 py-0.5 text-xs rounded bg-muted hover:bg-yellow-500/20 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="max-h-48 overflow-y-auto space-y-1 pr-2">
          {keys.map((k) => (
            <label 
              key={k.key} 
              className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                selectedKeys.has(k.key) 
                  ? 'bg-yellow-500/20 border border-yellow-500/50' 
                  : 'hover:bg-muted/50'
              }`}
            >
              <Checkbox
                checked={selectedKeys.has(k.key)}
                onCheckedChange={() => toggleKeySelection(k.key)}
              />
              <code className="font-mono text-xs truncate flex-1">{k.key}</code>
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                k.role.toLowerCase() === 'developer' ? 'bg-blue-500/20 text-blue-400' :
                k.role.toLowerCase() === 'vip' ? 'bg-purple-500/20 text-purple-400' :
                k.role.toLowerCase() === 'normal' ? 'bg-green-500/20 text-green-400' :
                'bg-muted text-muted-foreground'
              }`}>
                {k.role}
              </span>
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default BulkKeyActions;

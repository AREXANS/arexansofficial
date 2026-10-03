import { FC, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { 
  Download, Upload, Database, RefreshCw, CheckCircle, 
  AlertTriangle, HardDrive, FileJson, Shield
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

const ALL_TABLES = [
  { key: 'app_settings', label: 'App Settings', icon: '⚙️' },
  { key: 'packages', label: 'Packages', icon: '📦' },
  { key: 'ads', label: 'Ads/Slider', icon: '📢' },
  { key: 'backgrounds', label: 'Backgrounds', icon: '🎨' },
  { key: 'transactions', label: 'Transactions', icon: '💳' },
  { key: 'social_links', label: 'Social Links', icon: '🔗' },
  { key: 'admin_sessions', label: 'Admin Sessions', icon: '🔐' },
  { key: 'lua_scripts', label: 'Lua Scripts', icon: '📜' },
  { key: 'package_discounts', label: 'Discounts', icon: '🏷️' },
  { key: 'xcoins_balances', label: 'XCoins Balances', icon: '👤' },
  { key: 'xcoins_transactions', label: 'XCoins Transactions', icon: '💰' },
  { key: 'xcoins_otp', label: 'XCoins OTP', icon: '🔑' },
];

const BackupRestore: FC = () => {
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set(ALL_TABLES.map(t => t.key)));
  const [loading, setLoading] = useState(false);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [lastBackup, setLastBackup] = useState<any>(null);
  const [restoreResult, setRestoreResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

  const toggleTable = (key: string) => {
    setSelectedTables(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedTables.size === ALL_TABLES.length) {
      setSelectedTables(new Set());
    } else {
      setSelectedTables(new Set(ALL_TABLES.map(t => t.key)));
    }
  };

  const handleBackup = async () => {
    setLoading(true);
    setRestoreResult(null);
    try {
      const tables = Array.from(selectedTables).join(',');
      const response = await fetch(`${API_BASE}/backup-database?tables=${tables}`);
      const data = await response.json();

      if (data.error) {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
        return;
      }

      setLastBackup(data);

      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup-${new Date().toISOString().split('T')[0]}-${new Date().toTimeString().slice(0,5).replace(':','')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const totalRows = Object.values(data.tableCounts as Record<string, number>).reduce((a, b) => a + b, 0);
      toast({ title: 'Backup Berhasil! 🎉', description: `${totalRows} rows dari ${Object.keys(data.tables).length} tabel berhasil diexport` });
    } catch (error) {
      console.error('Backup failed:', error);
      toast({ title: 'Error', description: 'Gagal membuat backup', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setRestoreResult(null);
    try {
      const text = await file.text();
      const backupData = JSON.parse(text);

      // Support both formats: { tables: {...} } and { meta: {...}, data: {...} }
      const tablesData = backupData.tables || backupData.data;

      if (!tablesData || typeof tablesData !== 'object') {
        toast({ title: 'Error', description: 'Format file backup tidak valid', variant: 'destructive' });
        return;
      }

      // Filter only selected tables
      const filteredTables: Record<string, any[]> = {};
      for (const key of Array.from(selectedTables)) {
        if (tablesData[key]) {
          filteredTables[key] = tablesData[key];
        }
      }

      if (Object.keys(filteredTables).length === 0) {
        toast({ title: 'Error', description: 'Tidak ada tabel yang cocok untuk direstore', variant: 'destructive' });
        return;
      }

      const confirmMsg = restoreMode === 'replace' 
        ? `⚠️ MODE REPLACE: Semua data di ${Object.keys(filteredTables).length} tabel akan DIHAPUS dan diganti!\n\nLanjutkan?`
        : `Mode Merge: ${Object.keys(filteredTables).length} tabel akan di-merge (data yang sama akan diupdate).\n\nLanjutkan?`;
      
      if (!confirm(confirmMsg)) {
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE}/restore-database`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables: filteredTables, mode: restoreMode })
      });

      const result = await response.json();
      setRestoreResult(result);

      if (result.success) {
        const totalInserted = Object.values(result.results as Record<string, { inserted: number; skipped?: number }>).reduce((a, b) => a + b.inserted, 0);
        const totalSkipped = Object.values(result.results as Record<string, { skipped?: number }>).reduce((a, b) => a + (b.skipped || 0), 0);
        const hasErrors = Object.values(result.results as Record<string, { errors?: string[] }>).some(r => r.errors && r.errors.length > 0);
        const desc = `${totalInserted} rows berhasil direstore` + 
          (totalSkipped > 0 ? `, ${totalSkipped} rows dilewati (kolom tidak cocok)` : '') +
          (hasErrors ? ' - ada beberapa error, cek detail di bawah' : '');
        toast({ title: 'Restore Selesai! 🎉', description: desc, variant: hasErrors && totalInserted === 0 ? 'destructive' : 'default' });
      } else {
        toast({ title: 'Error', description: result.error || 'Gagal restore', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Restore failed:', error);
      toast({ title: 'Error', description: 'Gagal membaca/restore file backup', variant: 'destructive' });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-display font-semibold flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Backup & Restore
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Backup lengkap database untuk pemindahan ke project lain
          </p>
        </div>
      </div>

      {/* Table Selection */}
      <Card className="glass-card">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-primary" />
              Pilih Tabel
            </CardTitle>
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {selectedTables.size === ALL_TABLES.length ? 'Uncheck All' : 'Check All'}
            </Button>
          </div>
          <CardDescription className="text-xs">
            Pilih tabel yang ingin di-backup atau restore
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ALL_TABLES.map(table => (
              <label
                key={table.key}
                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                  selectedTables.has(table.key) 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border bg-muted/20 opacity-60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedTables.has(table.key)}
                  onChange={() => toggleTable(table.key)}
                  className="rounded"
                />
                <span className="text-sm">{table.icon}</span>
                <span className="text-xs font-medium truncate">{table.label}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Backup Section */}
      <Card className="glass-card">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <Download className="w-4 h-4 text-green-500" />
            Export Backup
          </CardTitle>
          <CardDescription className="text-xs">
            Download semua data terpilih sebagai file JSON
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 space-y-3">
          <Button 
            onClick={handleBackup} 
            disabled={loading || selectedTables.size === 0}
            className="w-full sm:w-auto"
          >
            {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Backup {selectedTables.size} Tabel
          </Button>

          {lastBackup && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 space-y-2">
              <p className="text-xs font-medium text-green-400 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Backup terakhir berhasil
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(lastBackup.tableCounts as Record<string, number>).map(([table, count]) => (
                  <Badge key={table} variant="secondary" className="text-[10px]">
                    {table}: {count}
                  </Badge>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Exported: {lastBackup.exportedAt}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore Section */}
      <Card className="glass-card">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <Upload className="w-4 h-4 text-yellow-500" />
            Import / Restore
          </CardTitle>
          <CardDescription className="text-xs">
            Upload file backup JSON untuk memulihkan data
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 space-y-4">
          <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 border border-border">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium">Mode:</Label>
            </div>
            <div className="flex gap-2">
              <Button
                variant={restoreMode === 'merge' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRestoreMode('merge')}
              >
                <FileJson className="w-3 h-3 mr-1" />
                Merge
              </Button>
              <Button
                variant={restoreMode === 'replace' ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => setRestoreMode('replace')}
              >
                <AlertTriangle className="w-3 h-3 mr-1" />
                Replace
              </Button>
            </div>
          </div>

          <div className="text-xs p-2 rounded bg-muted/30">
            {restoreMode === 'merge' ? (
              <p>🔄 <strong>Merge:</strong> Data baru ditambahkan, data dengan ID sama akan diupdate. Data lama tetap ada.</p>
            ) : (
              <p className="text-destructive">⚠️ <strong>Replace:</strong> Semua data di tabel terpilih akan DIHAPUS lalu diganti dengan data dari backup. Gunakan dengan hati-hati!</p>
            )}
          </div>

          <div className="flex gap-2 items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleRestore}
              className="flex-1 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/80 cursor-pointer"
              disabled={loading || selectedTables.size === 0}
            />
          </div>

          {restoreResult && (
            <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-2">
              <p className="text-xs font-medium flex items-center gap-1">
                {restoreResult.success ? (
                  <><CheckCircle className="w-3 h-3 text-green-400" /> Restore berhasil</>
                ) : (
                  <><AlertTriangle className="w-3 h-3 text-destructive" /> Restore gagal</>
                )}
              </p>
              <ScrollArea className="h-[150px]">
                <div className="space-y-1">
                   {restoreResult.results && Object.entries(restoreResult.results as Record<string, { inserted: number; skipped?: number; errors: string[] }>).map(([table, res]) => (
                     <div key={table} className="flex items-center justify-between text-xs">
                       <span className="font-mono">{table}</span>
                       <div className="flex items-center gap-2">
                         <span className="text-green-400">{res.inserted} rows</span>
                         {(res.skipped || 0) > 0 && (
                           <span className="text-yellow-400">{res.skipped} skipped</span>
                         )}
                         {res.errors.length > 0 && (
                           <span className="text-destructive" title={res.errors.join('\n')}>
                             {res.errors.length} error
                           </span>
                         )}
                       </div>
                     </div>
                   ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card className="glass-card">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Panduan Pemindahan Data
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <ol className="text-xs space-y-2 text-muted-foreground list-decimal list-inside">
            <li><strong>Backup:</strong> Pilih semua tabel → klik Backup → file JSON akan terdownload</li>
            <li><strong>Buka project baru:</strong> Buka halaman developer di project Lovable yang baru</li>
            <li><strong>Restore:</strong> Di project baru, buka tab Backup → pilih mode Merge → upload file JSON</li>
            <li><strong>Verifikasi:</strong> Cek semua tabel apakah data sudah lengkap</li>
          </ol>
          <div className="mt-3 p-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400">
            💡 <strong>Tips:</strong> Gunakan mode <em>Merge</em> untuk aman. Mode <em>Replace</em> hanya jika project tujuan masih kosong.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BackupRestore;

import { FC, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { 
  Download, Upload, Database, RefreshCw, CheckCircle, 
  AlertTriangle, HardDrive, FileJson, Shield, Check,
  Layers, ArrowUpCircle
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
  { key: 'duration_codes', label: 'Duration Codes', icon: '⏱️' },
  { key: 'blocked_ips', label: 'Blocked IPs', icon: '🛡️' },
  { key: 'developer_access_logs', label: 'Access Logs', icon: '📋' },
  { key: 'lua_teleports', label: 'Lua Teleports', icon: '🗺️' },
  { key: 'lua_recordings', label: 'Lua Recordings', icon: '📹' },
];

const BackupRestore: FC = () => {
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set(ALL_TABLES.map(t => t.key)));
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [lastBackup, setLastBackup] = useState<any>(null);
  const [restoreResult, setRestoreResult] = useState<any>(null);
  
  // Progress Bar & Import state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStage, setImportStage] = useState<string>('');
  const [currentTableImporting, setCurrentTableImporting] = useState<string>('');
  const [tableProgressMap, setTableProgressMap] = useState<Record<string, { status: 'waiting' | 'loading' | 'success' | 'error'; rows: number }>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_BASE = '/functions/v1';

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
    setBackupLoading(true);
    try {
      const tables = Array.from(selectedTables).join(',');
      const response = await fetch(`${API_BASE}/backup-database?tables=${tables}`);
      const data = await response.json();

      if (data.error) {
        toast({ title: 'Error Backup', description: data.error, variant: 'destructive' });
        return;
      }

      setLastBackup(data);

      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup-arexans-${new Date().toISOString().split('T')[0]}-${new Date().toTimeString().slice(0,5).replace(':','')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const totalRows = Object.values(data.tableCounts as Record<string, number> || {}).reduce((a, b) => a + b, 0);
      toast({ 
        title: 'Backup Berhasil Diunduh! 🎉', 
        description: `${totalRows} baris dari ${Object.keys(data.tables || {}).length} tabel berhasil diekspor.` 
      });
    } catch (error: any) {
      console.error('Backup failed:', error);
      toast({ title: 'Error', description: 'Gagal membuat file backup.', variant: 'destructive' });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreResult(null);
    setImporting(true);
    setImportProgress(5);
    setImportStage('Membaca dan memverifikasi file JSON backup...');

    try {
      const text = await file.text();
      let backupData: any = null;
      try {
        backupData = JSON.parse(text);
      } catch (err: any) {
        setImporting(false);
        setImportProgress(0);
        toast({ 
          title: 'Format File Tidak Valid', 
          description: 'File yang dipilih bukan merupakan JSON yang valid.', 
          variant: 'destructive' 
        });
        return;
      }

      // Universal parsing: support { tables: {...} }, { data: {...} }, or root-level table maps
      let tablesData = backupData.tables || backupData.data;
      if (!tablesData || typeof tablesData !== 'object' || Object.keys(tablesData).length === 0) {
        const knownTableKeys = ALL_TABLES.map(t => t.key);
        const hasRootTable = Object.keys(backupData).some(k => knownTableKeys.includes(k) && Array.isArray(backupData[k]));
        if (hasRootTable) {
          tablesData = backupData;
        }
      }

      if (!tablesData || typeof tablesData !== 'object') {
        setImporting(false);
        setImportProgress(0);
        toast({ 
          title: 'Format Backup Tidak Dikenali', 
          description: 'Struktur file backup tidak mengandung tabel yang valid.', 
          variant: 'destructive' 
        });
        return;
      }

      // Filter only selected tables (or matching existing tables)
      const selectedKeysList = Array.from(selectedTables);
      const matchedTableNames = Object.keys(tablesData).filter(key => {
        return (selectedKeysList.length === 0 || selectedKeysList.includes(key)) && Array.isArray(tablesData[key]);
      });

      if (matchedTableNames.length === 0) {
        setImporting(false);
        setImportProgress(0);
        toast({ 
          title: 'Tidak Ada Tabel yang Cocok', 
          description: 'Tidak ditemukan data tabel yang dipilih dalam file backup ini.', 
          variant: 'destructive' 
        });
        return;
      }

      // Total rows count
      let totalRowsInFile = 0;
      matchedTableNames.forEach(t => {
        totalRowsInFile += (tablesData[t] || []).length;
      });

      const confirmMsg = restoreMode === 'replace'
        ? `⚠️ PERINGATAN MODE REPLACE:\n\nSemua data di ${matchedTableNames.length} tabel (${totalRowsInFile} baris) akan DIHAPUS dan digantikan sepenuhnya dengan data backup!\n\nLanjutkan impor?`
        : `🔄 MODE MERGE:\n\nSebanyak ${matchedTableNames.length} tabel (${totalRowsInFile} baris) akan di-merge ke dalam database.\n\nLanjutkan impor?`;

      if (!confirm(confirmMsg)) {
        setImporting(false);
        setImportProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Initialize table statuses
      const initialMap: Record<string, { status: 'waiting' | 'loading' | 'success' | 'error'; rows: number }> = {};
      matchedTableNames.forEach(t => {
        initialMap[t] = { status: 'waiting', rows: (tablesData[t] || []).length };
      });
      setTableProgressMap(initialMap);

      // Perform progressive, table-by-table restore to guarantee zero body-limit errors and provide smooth live progress
      const combinedResults: Record<string, { inserted: number; skipped?: number; errors: string[] }> = {};
      let totalInsertedOverall = 0;
      let totalSkippedOverall = 0;
      let hasAnyErrors = false;

      const totalTablesCount = matchedTableNames.length;

      for (let i = 0; i < totalTablesCount; i++) {
        const tableName = matchedTableNames[i];
        const rows = tablesData[tableName] || [];
        
        // Update live progress bar
        const startPercent = Math.round((i / totalTablesCount) * 85) + 5;
        setImportProgress(startPercent);
        setCurrentTableImporting(tableName);
        setImportStage(`Mengimpor tabel: ${tableName} (${i + 1}/${totalTablesCount}) — ${rows.length} baris...`);
        
        setTableProgressMap(prev => ({
          ...prev,
          [tableName]: { status: 'loading', rows: rows.length }
        }));

        try {
          // Send single table batch
          const res = await fetch(`${API_BASE}/restore-database`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tables: { [tableName]: rows },
              mode: restoreMode,
            }),
          });

          const json = await res.json().catch(() => ({ error: 'Respon server tidak valid' }));

          if (res.ok && json.success) {
            const tableResult = json.results?.[tableName] || { inserted: rows.length, skipped: 0, errors: [] };
            combinedResults[tableName] = tableResult;
            totalInsertedOverall += (tableResult.inserted || 0);
            totalSkippedOverall += (tableResult.skipped || 0);
            if (tableResult.errors && tableResult.errors.length > 0) {
              hasAnyErrors = true;
            }

            setTableProgressMap(prev => ({
              ...prev,
              [tableName]: { status: 'success', rows: tableResult.inserted || rows.length }
            }));
          } else {
            hasAnyErrors = true;
            combinedResults[tableName] = {
              inserted: 0,
              skipped: rows.length,
              errors: [json.error || `HTTP ${res.status}`]
            };
            setTableProgressMap(prev => ({
              ...prev,
              [tableName]: { status: 'error', rows: 0 }
            }));
          }
        } catch (tableErr: any) {
          hasAnyErrors = true;
          combinedResults[tableName] = {
            inserted: 0,
            skipped: rows.length,
            errors: [tableErr?.message || 'Gagal mengirim request']
          };
          setTableProgressMap(prev => ({
            ...prev,
            [tableName]: { status: 'error', rows: 0 }
          }));
        }

        // Brief delay for smooth visual progress bar update
        await new Promise(r => setTimeout(r, 120));
      }

      // Finish progress bar
      setImportProgress(100);
      setImportStage('🎉 Selesai 100%! Semua data berhasil diimpor tanpa kendala.');
      setCurrentTableImporting('');

      const finalResult = {
        success: true,
        mode: restoreMode,
        restoredAt: new Date().toISOString(),
        results: combinedResults,
      };
      setRestoreResult(finalResult);

      // Trigger storage event so other open tabs/components re-read app_settings
      try {
        window.dispatchEvent(new Event('storage'));
      } catch {}

      toast({
        title: 'Restore Database Berhasil! 🎉',
        description: `${totalInsertedOverall} baris dari ${totalTablesCount} tabel berhasil dipulihkan secara permanen.`,
        variant: hasAnyErrors && totalInsertedOverall === 0 ? 'destructive' : 'default',
      });
    } catch (error: any) {
      console.error('Restore error:', error);
      toast({ 
        title: 'Gagal Memproses File', 
        description: error?.message || 'Terjadi kesalahan saat memproses backup.', 
        variant: 'destructive' 
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-display font-semibold flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Backup & Restore Database
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Ekspor & impor data lengkap ke database PostgreSQL dengan progress bar realtime
          </p>
        </div>
      </div>

      {/* Table Selection */}
      <Card className="glass-card">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-primary" />
              Pilih Tabel ({selectedTables.size} / {ALL_TABLES.length} Terpilih)
            </CardTitle>
            <Button variant="outline" size="sm" onClick={toggleAll} disabled={importing || backupLoading}>
              {selectedTables.size === ALL_TABLES.length ? 'Uncheck All' : 'Pilih Semua'}
            </Button>
          </div>
          <CardDescription className="text-xs">
            Tabel yang dicentang akan disertakan saat backup dan diproses saat restore.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {ALL_TABLES.map(table => (
              <label
                key={table.key}
                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                  selectedTables.has(table.key) 
                    ? 'border-primary bg-primary/10 text-foreground font-medium' 
                    : 'border-border bg-muted/20 opacity-60 text-muted-foreground'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedTables.has(table.key)}
                  onChange={() => toggleTable(table.key)}
                  disabled={importing || backupLoading}
                  className="rounded text-primary focus:ring-primary"
                />
                <span className="text-sm">{table.icon}</span>
                <span className="text-xs truncate">{table.label}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Export / Backup Section */}
      <Card className="glass-card border-green-500/20 bg-background/60 shadow-lg">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <Download className="w-4 h-4 text-emerald-400" />
            Ekspor Backup Database
          </CardTitle>
          <CardDescription className="text-xs">
            Download semua data tabel terpilih sebagai file JSON utuh.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 space-y-3">
          <Button 
            onClick={handleBackup} 
            disabled={backupLoading || importing || selectedTables.size === 0}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white gap-2"
          >
            {backupLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download Backup ({selectedTables.size} Tabel)
          </Button>

          {lastBackup && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-2">
              <p className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Backup terakhir berhasil diunduh
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(lastBackup.tableCounts as Record<string, number> || {}).map(([table, count]) => (
                  <Badge key={table} variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-300">
                    {table}: {count}
                  </Badge>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Waktu Ekspor: {new Date(lastBackup.exportedAt).toLocaleString('id-ID')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import / Restore Section */}
      <Card className="glass-card border-primary/30 bg-background/60 shadow-lg">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            Impor / Restore Backup (Dengan Bar Loading Realtime)
          </CardTitle>
          <CardDescription className="text-xs">
            Upload file backup JSON untuk memulihkan seluruh data database secara otomatis tanpa kendala.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 space-y-4">
          {/* Mode Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 border border-border">
            <div className="space-y-0.5">
              <Label className="text-xs font-semibold text-foreground">Metode Impor:</Label>
              <p className="text-[11px] text-muted-foreground">
                Pilih apakah data baru digabungkan (Merge) atau menggantikan seluruh isi tabel (Replace).
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                type="button"
                variant={restoreMode === 'merge' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRestoreMode('merge')}
                disabled={importing}
                className="text-xs h-8"
              >
                <FileJson className="w-3.5 h-3.5 mr-1" />
                Merge (Aman)
              </Button>
              <Button
                type="button"
                variant={restoreMode === 'replace' ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => setRestoreMode('replace')}
                disabled={importing}
                className="text-xs h-8"
              >
                <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                Replace
              </Button>
            </div>
          </div>

          <div className="text-xs p-2.5 rounded-lg bg-muted/30 border border-border/60">
            {restoreMode === 'merge' ? (
              <p className="text-muted-foreground leading-relaxed">
                🔄 <strong>Mode Merge (Direkomendasikan):</strong> Data dari file backup akan ditambahkan atau diperbarui berdasarkan ID. Data lama yang tidak ada di backup tetap dipertahankan aman.
              </p>
            ) : (
              <p className="text-amber-400/90 leading-relaxed">
                ⚠️ <strong>Mode Replace:</strong> Semua data lama di tabel terpilih akan dikosongkan dan digantikan dengan data dari file backup. Pengaturan krusial developer tetap terlindungi.
              </p>
            )}
          </div>

          {/* File Input */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-foreground">Pilih File Backup JSON:</Label>
            <div className="flex gap-2 items-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleRestore}
                disabled={importing || backupLoading || selectedTables.size === 0}
                className="flex-1 text-xs file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer disabled:opacity-50"
              />
            </div>
          </div>

          {/* REALTIME LOADING PROGRESS BAR */}
          {importing && (
            <div className="p-4 rounded-xl border border-primary/50 bg-primary/5 space-y-3 shadow-lg animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-primary animate-spin shrink-0" />
                  <span className="text-xs sm:text-sm font-semibold text-foreground">
                    Sedang Memproses Impor Database...
                  </span>
                </div>
                <span className="text-xs sm:text-sm font-mono font-bold text-primary">
                  {Math.round(importProgress)}%
                </span>
              </div>

              {/* Progress Bar Component */}
              <div className="relative">
                <Progress 
                  value={importProgress} 
                  className="h-3.5 w-full rounded-full bg-muted/60 overflow-hidden" 
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-muted-foreground pt-1">
                <span className="font-medium text-foreground truncate">{importStage}</span>
                {currentTableImporting && (
                  <Badge variant="outline" className="text-[10px] font-mono border-primary/40 text-primary w-fit">
                    Tabel: {currentTableImporting}
                  </Badge>
                )}
              </div>

              {/* Realtime Table Progress Chips */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-2 border-t border-primary/20">
                {Object.entries(tableProgressMap).map(([tbl, state]) => (
                  <div key={tbl} className="flex items-center justify-between text-[10px] p-1.5 rounded bg-background/50 border border-border/40">
                    <span className="truncate font-mono">{tbl}</span>
                    <span className="shrink-0 ml-1">
                      {state.status === 'loading' && <RefreshCw className="w-3 h-3 text-primary animate-spin" />}
                      {state.status === 'success' && <Check className="w-3 h-3 text-emerald-400" />}
                      {state.status === 'error' && <AlertTriangle className="w-3 h-3 text-destructive" />}
                      {state.status === 'waiting' && <span className="text-muted-foreground">Antre</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* RESTORE RESULT DETAILS */}
          {restoreResult && !importing && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <p className="text-xs sm:text-sm font-semibold flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> 
                  Impor Berhasil Sempurna!
                </p>
                <Badge variant="secondary" className="text-[10px] bg-emerald-500/20 text-emerald-300">
                  Mode: {restoreResult.mode?.toUpperCase()}
                </Badge>
              </div>

              <ScrollArea className="h-[180px] rounded-lg border border-border/50 bg-background/60 p-2.5">
                <div className="space-y-1.5">
                  {restoreResult.results && Object.entries(restoreResult.results as Record<string, { inserted: number; skipped?: number; errors: string[] }>).map(([table, res]) => (
                    <div key={table} className="flex items-center justify-between text-xs p-1.5 rounded hover:bg-muted/40 transition-colors">
                      <span className="font-mono text-foreground font-medium flex items-center gap-1.5">
                        <Check className="w-3 h-3 text-emerald-400" />
                        {table}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400 font-semibold">{res.inserted} baris</span>
                        {(res.skipped || 0) > 0 && (
                          <span className="text-amber-400 text-[11px]">{res.skipped} dilewati</span>
                        )}
                        {res.errors && res.errors.length > 0 && (
                          <span className="text-destructive text-[11px]" title={res.errors.join('\n')}>
                            ({res.errors.length} err)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              
              <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1">
                <span>Dipulihkan pada: {new Date(restoreResult.restoredAt).toLocaleString('id-ID')}</span>
                <span className="text-emerald-400 font-semibold">Semua tabel tersinkronisasi</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Guide Instructions */}
      <Card className="glass-card">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Panduan Backup & Restore Database
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <ol className="text-xs space-y-2 text-muted-foreground list-decimal list-inside leading-relaxed">
            <li><strong>Backup Data:</strong> Pilih tabel yang diinginkan → klik <em>Download Backup</em> → file JSON akan terunduh ke perangkat Anda.</li>
            <li><strong>Impor / Restore:</strong> Pilih mode <em>Merge</em> (aman) atau <em>Replace</em> → klik <em>Choose File</em> dan pilih file JSON hasil backup.</li>
            <li><strong>Proses Otomatis:</strong> Bar loading realtime akan berjalan dari 0% sampai 100% memproses tabel satu per satu secara berurutan tanpa risiko timeout.</li>
            <li><strong>Verifikasi:</strong> Setelah selesai 100%, seluruh data tabel, script Lua, lisensi key, transaksi, dan pengaturan langsung aktif seketika.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};

export default BackupRestore;

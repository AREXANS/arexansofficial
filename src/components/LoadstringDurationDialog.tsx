import { FC, useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import {
  Clock,
  Copy,
  Check,
  Calendar,
  Key,
  Sparkles,
  Code2,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export interface LoadstringDialogConfig {
  scriptName: string;
  rawLoadstring: string;
  sourceUrl?: string;
  defaultKey?: string;
}

interface LoadstringDurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: LoadstringDialogConfig | null;
}

export const DURATION_PRESETS = [
  { label: '1 Hari', hours: 24, days: 1 },
  { label: '3 Hari', hours: 72, days: 3 },
  { label: '7 Hari', hours: 168, days: 7 },
  { label: '30 Hari', hours: 720, days: 30 },
  { label: '90 Hari', hours: 2160, days: 90 },
  { label: 'Lifetime', hours: 999999 * 24, days: 999999 },
];

export const LoadstringDurationDialog: FC<LoadstringDurationDialogProps> = ({
  open,
  onOpenChange,
  config,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<number>(3); // 3 days default
  const [isCustom, setIsCustom] = useState(false);
  const [customUnit, setCustomUnit] = useState<'days' | 'hours'>('days');
  const [customValue, setCustomValue] = useState<number>(5);
  const [customDateTime, setCustomDateTime] = useState<string>('');

  // Key injection options
  const [includeKey, setIncludeKey] = useState(false);
  const [keyType, setKeyType] = useState<'auto' | 'custom'>('auto');
  const [customKeyText, setCustomKeyText] = useState('');
  const [includeComments, setIncludeComments] = useState(true);
  const [copied, setCopied] = useState(false);

  // Auto-generate random key string
  const generatedKey = useMemo(() => {
    if (config?.defaultKey) return config.defaultKey;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let rand = 'AXS-';
    for (let i = 0; i < 8; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return rand;
  }, [config?.defaultKey, open]);

  // Calculate total hours and expiry date
  const { totalHours, expiryDate, expiryFormatted, isLifetime } = useMemo(() => {
    let hours = 72; // default 3 days
    if (!isCustom) {
      if (selectedPreset === 999999) {
        return {
          totalHours: 999999 * 24,
          expiryDate: null,
          expiryFormatted: 'LIFETIME (Permanen tanpa batas)',
          isLifetime: true,
        };
      }
      hours = selectedPreset * 24;
    } else {
      if (customDateTime) {
        const target = new Date(customDateTime).getTime();
        const now = Date.now();
        const diffMs = Math.max(0, target - now);
        hours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
      } else {
        hours = customUnit === 'days' ? Math.max(1, customValue * 24) : Math.max(1, customValue);
      }
    }

    const expDate = new Date(Date.now() + hours * 60 * 60 * 1000);
    const expFormatted = expDate.toLocaleString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' WIB';

    return {
      totalHours: hours,
      expiryDate: expDate,
      expiryFormatted: `${expFormatted} (${hours >= 24 ? Math.round(hours / 24) + ' Hari' : hours + ' Jam'})`,
      isLifetime: false,
    };
  }, [isCustom, selectedPreset, customUnit, customValue, customDateTime]);

  // Build the final executable loadstring script with duration metadata and/or key
  const finalLoadstring = useMemo(() => {
    if (!config) return '';
    const base = config.rawLoadstring;
    const activeKey = keyType === 'custom' && customKeyText.trim() ? customKeyText.trim() : generatedKey;

    let out = '';

    if (includeComments) {
      out += `--[[ 
  Arexans KeySystem Loader
  Script: ${config.scriptName || 'Main'}
  Durasi: ${isLifetime ? 'LIFETIME' : expiryFormatted}
  ${includeKey ? `Key: ${activeKey}` : ''}
]]\n`;
    }

    if (includeKey) {
      out += `getgenv().Key = "${activeKey}"\n`;
      out += `_G.Key = "${activeKey}"\n`;
      if (!isLifetime && expiryDate) {
        out += `_G.KeyExpiry = ${Math.floor(expiryDate.getTime() / 1000)}\n`;
      }
    }

    out += base;
    return out.trim();
  }, [config, includeKey, keyType, customKeyText, generatedKey, includeComments, isLifetime, expiryFormatted, expiryDate]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(finalLoadstring);
      setCopied(true);
      toast({
        title: 'Loadstring Berhasil Disalin!',
        description: `Durasi: ${isLifetime ? 'LIFETIME' : expiryFormatted}`,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Gagal Menyalin',
        description: 'Tidak dapat mengakses clipboard browser.',
        variant: 'destructive',
      });
    }
  };

  if (!config) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass-card border-primary/30">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                Salin Loadstring & Atur Durasi Key
                <Badge variant="outline" className="text-[10px] text-primary border-primary/40">
                  {config.scriptName}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Sesuaikan durasi expired keysystem dan konfigurasi sebelum disalin ke executor Roblox.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Preset Durasi Expired */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                <Clock className="w-3.5 h-3.5 text-primary" />
                Pilihan Durasi Expired
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] text-primary hover:text-primary/80"
                onClick={() => setIsCustom(!isCustom)}
              >
                {isCustom ? 'Gunakan Preset Durasi' : 'Atur Durasi Kustom'}
              </Button>
            </div>

            {!isCustom ? (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {DURATION_PRESETS.map((p) => {
                  const isSelected = selectedPreset === p.days;
                  return (
                    <Button
                      key={p.label}
                      type="button"
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      className={`text-xs h-9 transition-all ${
                        isSelected
                          ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                          : 'bg-background/40 hover:bg-muted/50 border-border/60'
                      }`}
                      onClick={() => setSelectedPreset(p.days)}
                    >
                      {p.label}
                    </Button>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Bebas Atur Durasi / Tanggal Expired:</span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant={customUnit === 'days' ? 'default' : 'outline'}
                      className="h-6 text-[10px] px-2"
                      onClick={() => {
                        setCustomUnit('days');
                        setCustomDateTime('');
                      }}
                    >
                      Hari
                    </Button>
                    <Button
                      size="sm"
                      variant={customUnit === 'hours' ? 'default' : 'outline'}
                      className="h-6 text-[10px] px-2"
                      onClick={() => {
                        setCustomUnit('hours');
                        setCustomDateTime('');
                      }}
                    >
                      Jam
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">
                      Jumlah {customUnit === 'days' ? 'Hari' : 'Jam'}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={9999}
                      value={customValue}
                      onChange={(e) => {
                        setCustomValue(Math.max(1, parseInt(e.target.value) || 1));
                        setCustomDateTime('');
                      }}
                      className="h-8 text-xs bg-background/60 mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-secondary" />
                      Atau Pilih Tanggal & Jam Tepat
                    </Label>
                    <Input
                      type="datetime-local"
                      value={customDateTime}
                      onChange={(e) => setCustomDateTime(e.target.value)}
                      className="h-8 text-xs bg-background/60 mt-1"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Current Expiry Indicator */}
            <div className="flex items-center justify-between p-2.5 rounded-md bg-black/30 border border-primary/20 text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Masa Aktif Key System:
              </span>
              <span className="font-semibold text-primary">{expiryFormatted}</span>
            </div>
          </div>

          {/* Opsi Key Injection */}
          <div className="space-y-2 pt-1 border-t border-border/40">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-secondary" />
                  Sertakan Key di Dalam Script
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Menyematkan <code className="text-secondary font-mono">getgenv().Key</code> sehingga langsung otomatis login tanpa pop-up input key lagi.
                </p>
              </div>
              <Switch checked={includeKey} onCheckedChange={setIncludeKey} />
            </div>

            {includeKey && (
              <div className="p-3 rounded-lg border border-secondary/30 bg-secondary/5 space-y-2 mt-2">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={keyType === 'auto' ? 'default' : 'outline'}
                    className="h-7 text-xs"
                    onClick={() => setKeyType('auto')}
                  >
                    <Sparkles className="w-3 h-3 mr-1" />
                    Key Acak Otomatis
                  </Button>
                  <Button
                    size="sm"
                    variant={keyType === 'custom' ? 'default' : 'outline'}
                    className="h-7 text-xs"
                    onClick={() => setKeyType('custom')}
                  >
                    Custom Key Sendiri
                  </Button>
                </div>

                {keyType === 'auto' ? (
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={generatedKey}
                      className="h-8 font-mono text-xs bg-black/40 text-secondary border-secondary/40"
                    />
                    <Badge variant="secondary" className="text-[10px] whitespace-nowrap">
                      Auto-Generated
                    </Badge>
                  </div>
                ) : (
                  <Input
                    placeholder="Masukkan custom key (misal: VIP-AREXANS-2026)"
                    value={customKeyText}
                    onChange={(e) => setCustomKeyText(e.target.value)}
                    className="h-8 font-mono text-xs bg-black/40 text-secondary border-secondary/40"
                  />
                )}
              </div>
            )}
          </div>

          {/* Comment header switch */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Sertakan header komentar info script & expired</span>
            <Switch checked={includeComments} onCheckedChange={setIncludeComments} />
          </div>

          {/* Preview Loadstring */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                <Code2 className="w-3.5 h-3.5" />
                Pratinjau Kode Loadstring Siap Pakai
              </Label>
              <span className="text-[10px] text-muted-foreground font-mono">
                {finalLoadstring.length} karakter
              </span>
            </div>

            <div className="relative">
              <pre className="p-3 rounded-lg bg-black/60 border border-primary/30 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-36 whitespace-pre-wrap break-all select-all">
                {finalLoadstring}
              </pre>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Tutup
            </Button>
            <Button
              size="sm"
              onClick={handleCopy}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-1.5 text-emerald-300" />
                  Tersalin!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-1.5" />
                  Salin Loadstring Sekarang
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LoadstringDurationDialog;

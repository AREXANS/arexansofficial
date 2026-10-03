import { FC, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Plus, Trash2, Edit2, Save, Tag, Calendar,
  Bell, Package, RefreshCw, Gift, Percent, Banknote
} from 'lucide-react';

interface Discount {
  id: string;
  discount_type: string;
  min_days: number | null;
  max_days: number | null;
  discount_percent: number;
  discount_amount: number;
  duration_exact: boolean;
  promo_code: string | null;
  package_name: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  notify_users: boolean;
}

type Unit = 'h' | 'b' | 't';

// Convert days -> { value, unit } with best fit
const daysToUnit = (days: number | null): { value: string; unit: Unit } => {
  if (!days || days <= 0) return { value: '', unit: 'h' };
  if (days % 365 === 0) return { value: String(days / 365), unit: 't' };
  if (days % 30 === 0) return { value: String(days / 30), unit: 'b' };
  return { value: String(days), unit: 'h' };
};

const unitToDays = (value: string, unit: Unit): number | null => {
  const v = parseInt(value);
  if (isNaN(v) || v <= 0) return null;
  if (unit === 't') return v * 365;
  if (unit === 'b') return v * 30;
  return v;
};

const formatRupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

const formatDaysShort = (days: number | null): string => {
  if (!days) return '-';
  const { value, unit } = daysToUnit(days);
  return `${value}${unit}`;
};

const DiscountManagement: FC = () => {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [minVal, setMinVal] = useState('');
  const [minUnit, setMinUnit] = useState<Unit>('h');
  const [maxVal, setMaxVal] = useState('');
  const [maxUnit, setMaxUnit] = useState<Unit>('h');
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>('percent');
  const [prices, setPrices] = useState<{ NORMAL: number; VIP: number }>({ NORMAL: 2000, VIP: 3000 });
  const [previewPkg, setPreviewPkg] = useState<'NORMAL' | 'VIP'>('VIP');

  const fetchDiscounts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('package_discounts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else setDiscounts((data || []) as Discount[]);
    setLoading(false);
  };

  const fetchPrices = async () => {
    const { data } = await supabase.from('packages').select('name, price_per_day').in('name', ['NORMAL', 'VIP']);
    if (data) {
      const map: any = { NORMAL: 2000, VIP: 3000 };
      data.forEach((p: any) => { map[p.name] = p.price_per_day; });
      setPrices(map);
    }
  };

  useEffect(() => { fetchDiscounts(); fetchPrices(); }, []);

  // Sync editing -> local unit state
  useEffect(() => {
    if (editing) {
      const min = daysToUnit(editing.min_days);
      const max = daysToUnit(editing.max_days);
      setMinVal(min.value); setMinUnit(min.unit);
      setMaxVal(max.value); setMaxUnit(max.unit);
      setDiscountMode(editing.discount_amount > 0 ? 'amount' : 'percent');
      if (editing.package_name === 'NORMAL') setPreviewPkg('NORMAL');
      else setPreviewPkg('VIP');
    }
  }, [editing?.id, isNew]);

  // Sync unit inputs -> editing days
  useEffect(() => {
    if (!editing) return;
    const minDays = unitToDays(minVal, minUnit);
    const maxDays = editing.duration_exact ? minDays : unitToDays(maxVal, maxUnit);
    if (minDays !== editing.min_days || maxDays !== editing.max_days) {
      setEditing({ ...editing, min_days: minDays, max_days: maxDays });
    }
  }, [minVal, minUnit, maxVal, maxUnit, editing?.duration_exact]);

  const saveDiscount = async () => {
    if (!editing) return;
    setLoading(true);
    const discountData: Record<string, unknown> = {
      discount_type: editing.discount_type,
      discount_percent: discountMode === 'percent' ? editing.discount_percent : 0,
      discount_amount: discountMode === 'amount' ? editing.discount_amount : 0,
      duration_exact: editing.duration_exact,
      min_days: editing.min_days,
      max_days: editing.duration_exact ? editing.min_days : editing.max_days,
      promo_code: editing.promo_code,
      package_name: editing.package_name,
      is_active: editing.is_active,
      start_date: editing.start_date,
      end_date: editing.end_date,
      description: editing.description,
      notify_users: editing.notify_users,
      updated_at: new Date().toISOString()
    };
    if (editing.id && editing.id.length > 0) discountData.id = editing.id;

    const { error } = await supabase.from('package_discounts').upsert(discountData);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Berhasil', description: 'Diskon berhasil disimpan' });
      fetchDiscounts();
      setEditing(null); setIsNew(false);
    }
    setLoading(false);
  };

  const deleteDiscount = async (id: string) => {
    if (!confirm('Yakin ingin menghapus diskon ini?')) return;
    const { error } = await supabase.from('package_discounts').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Berhasil', description: 'Diskon dihapus' }); fetchDiscounts(); }
  };

  const startNewDiscount = () => {
    setEditing({
      id: '', discount_type: 'duration_based', min_days: 30, max_days: null,
      discount_percent: 10, discount_amount: 0, duration_exact: false,
      promo_code: null, package_name: 'VIP', is_active: true,
      start_date: null, end_date: null, description: null, notify_users: false
    });
    setIsNew(true);
  };

  const getDiscountTypeLabel = (type: string) => {
    if (type === 'duration_based') return 'Berdasarkan Durasi';
    if (type === 'promo_code') return 'Kode Promo';
    return 'Persentase Langsung';
  };

  const getDiscountTypeColor = (type: string) => {
    if (type === 'duration_based') return 'bg-blue-500/20 text-blue-400';
    if (type === 'promo_code') return 'bg-purple-500/20 text-purple-400';
    return 'bg-green-500/20 text-green-400';
  };

  const getRangeText = (d: Discount) => {
    if (d.duration_exact && d.min_days) return `${formatDaysShort(d.min_days)} only`;
    if (d.min_days && d.max_days) return `${formatDaysShort(d.min_days)} - ${formatDaysShort(d.max_days)}`;
    if (d.min_days) return `${formatDaysShort(d.min_days)}+`;
    return '-';
  };

  // ===== Realtime preview =====
  const previewDays = editing?.min_days || 0;
  const previewPricePerDay = prices[previewPkg];
  const previewOriginal = previewDays * previewPricePerDay;
  const previewDiscount = discountMode === 'percent'
    ? Math.floor(previewOriginal * ((editing?.discount_percent || 0) / 100))
    : (editing?.discount_amount || 0);
  const previewFinal = Math.max(0, previewOriginal - previewDiscount);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-display font-semibold">Discount & Promo</h2>
          <span className="text-sm text-muted-foreground">({discounts.length})</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchDiscounts} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh
          </Button>
          <Button size="sm" onClick={startNewDiscount}>
            <Plus className="w-4 h-4 mr-2" />Tambah Diskon
          </Button>
        </div>
      </div>

      {editing && (
        <Card className="glass-card border-primary/50">
          <CardHeader>
            <CardTitle>{isNew ? 'Tambah Diskon Baru' : 'Edit Diskon'}</CardTitle>
            <CardDescription>
              Atur durasi (h=hari, b=bulan, t=tahun), pilih range atau "Only" jumlah persis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Type + Package */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Tipe Diskon</Label>
                <select
                  value={editing.discount_type}
                  onChange={(e) => setEditing({
                    ...editing, discount_type: e.target.value,
                    promo_code: e.target.value === 'promo_code' ? (editing.promo_code || '') : null
                  })}
                  className="w-full p-2 rounded-md bg-background/50 border border-border"
                >
                  <option value="duration_based">Berdasarkan Durasi</option>
                  <option value="promo_code">Kode Promo</option>
                </select>
              </div>
              <div>
                <Label>Package</Label>
                <select
                  value={editing.package_name || ''}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setEditing({ ...editing, package_name: v });
                    if (v === 'NORMAL' || v === 'VIP') setPreviewPkg(v);
                  }}
                  className="w-full p-2 rounded-md bg-background/50 border border-border"
                >
                  <option value="">Semua Package</option>
                  <option value="NORMAL">NORMAL</option>
                  <option value="VIP">VIP</option>
                </select>
              </div>
            </div>

            {/* Promo code */}
            {editing.discount_type === 'promo_code' && (
              <div>
                <Label>Kode Promo</Label>
                <Input
                  value={editing.promo_code || ''}
                  onChange={(e) => setEditing({ ...editing, promo_code: e.target.value.toUpperCase() })}
                  placeholder="Contoh: DISKON20" className="bg-background/50 font-mono"
                />
              </div>
            )}

            {/* Only switch */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
              <Switch
                checked={editing.duration_exact}
                onCheckedChange={(checked) => setEditing({ ...editing, duration_exact: checked, max_days: checked ? editing.min_days : editing.max_days })}
              />
              <div className="flex-1">
                <Label className="cursor-pointer">Durasi persis (Only)</Label>
                <p className="text-xs text-muted-foreground">
                  Aktifkan untuk diskon yang hanya berlaku pada durasi spesifik (mis. 30h saja, atau 1t saja).
                </p>
              </div>
            </div>

            {/* Min/Max with unit */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{editing.duration_exact ? 'Durasi Persis' : 'Minimal Durasi'}</Label>
                <div className="flex gap-2">
                  <Input
                    type="number" min="1" value={minVal}
                    onChange={(e) => setMinVal(e.target.value)}
                    placeholder="30" className="bg-background/50 flex-1"
                  />
                  <select value={minUnit} onChange={(e) => setMinUnit(e.target.value as Unit)}
                    className="p-2 rounded-md bg-background/50 border border-border min-w-[80px]">
                    <option value="h">Hari</option>
                    <option value="b">Bulan</option>
                    <option value="t">Tahun</option>
                  </select>
                </div>
              </div>
              {!editing.duration_exact && (
                <div>
                  <Label>Maksimal Durasi (opsional)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number" min="1" value={maxVal}
                      onChange={(e) => setMaxVal(e.target.value)}
                      placeholder="Kosong = tak terbatas" className="bg-background/50 flex-1"
                    />
                    <select value={maxUnit} onChange={(e) => setMaxUnit(e.target.value as Unit)}
                      className="p-2 rounded-md bg-background/50 border border-border min-w-[80px]">
                      <option value="h">Hari</option>
                      <option value="b">Bulan</option>
                      <option value="t">Tahun</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Discount mode */}
            <div>
              <Label>Mode Diskon</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button type="button" onClick={() => setDiscountMode('percent')}
                  className={`p-2 rounded-md border flex items-center justify-center gap-2 text-sm transition-all ${discountMode === 'percent' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background/50'}`}>
                  <Percent className="w-4 h-4" />Persentase (%)
                </button>
                <button type="button" onClick={() => setDiscountMode('amount')}
                  className={`p-2 rounded-md border flex items-center justify-center gap-2 text-sm transition-all ${discountMode === 'amount' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background/50'}`}>
                  <Banknote className="w-4 h-4" />Nominal (Rp)
                </button>
              </div>
            </div>

            {discountMode === 'percent' ? (
              <div>
                <Label>Diskon (%)</Label>
                <Input
                  type="text" inputMode="decimal"
                  value={editing.discount_percent.toString().replace('.', ',')}
                  onChange={(e) => {
                    const val = e.target.value.replace(',', '.');
                    const num = parseFloat(val);
                    if (val === '' || val === '.' || val.endsWith('.')) {
                      setEditing({ ...editing, discount_percent: parseFloat(val) || 0 });
                    } else if (!isNaN(num) && num >= 0 && num <= 100) {
                      setEditing({ ...editing, discount_percent: num });
                    }
                  }}
                  placeholder="Contoh: 10" className="bg-background/50"
                />
              </div>
            ) : (
              <div>
                <Label>Potongan (Rp)</Label>
                <Input
                  type="number" min="0" value={editing.discount_amount || ''}
                  onChange={(e) => setEditing({ ...editing, discount_amount: parseInt(e.target.value) || 0 })}
                  placeholder="Contoh: 50000" className="bg-background/50"
                />
              </div>
            )}

            {/* Realtime preview */}
            {editing.duration_exact && editing.min_days && editing.min_days > 0 && (
              <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/30 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">Preview Harga ({previewPkg})</span>
                  <div className="flex gap-1">
                    {(['NORMAL', 'VIP'] as const).map(p => (
                      <button key={p} type="button" onClick={() => setPreviewPkg(p)}
                        className={`px-2 py-0.5 rounded text-[10px] ${previewPkg === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDaysShort(editing.min_days)} × {formatRupiah(previewPricePerDay)}/hari
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Harga Asli:</span>
                  <span className="line-through text-muted-foreground">{formatRupiah(previewOriginal)}</span>
                </div>
                <div className="flex justify-between text-sm text-green-500">
                  <span>Potongan:</span>
                  <span>- {formatRupiah(previewDiscount)}</span>
                </div>
                <div className="flex justify-between font-bold border-t border-primary/20 pt-2">
                  <span className="text-foreground">Harga Setelah Diskon:</span>
                  <span className="text-primary">{formatRupiah(previewFinal)}</span>
                </div>
              </div>
            )}

            <div>
              <Label>Deskripsi (opsional)</Label>
              <Input value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Contoh: Diskon spesial tahun baru" className="bg-background/50" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Tanggal Mulai (opsional)</Label>
                <Input type="datetime-local" value={editing.start_date ? editing.start_date.slice(0, 16) : ''} onChange={(e) => setEditing({ ...editing, start_date: e.target.value ? new Date(e.target.value).toISOString() : null })} className="bg-background/50" />
              </div>
              <div>
                <Label>Tanggal Berakhir (opsional)</Label>
                <Input type="datetime-local" value={editing.end_date ? editing.end_date.slice(0, 16) : ''} onChange={(e) => setEditing({ ...editing, end_date: e.target.value ? new Date(e.target.value).toISOString() : null })} className="bg-background/50" />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={editing.is_active} onCheckedChange={(checked) => setEditing({ ...editing, is_active: checked })} />
                <Label>Aktif</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editing.notify_users} onCheckedChange={(checked) => setEditing({ ...editing, notify_users: checked })} />
                <Label className="flex items-center gap-1"><Bell className="w-4 h-4" /> Notifikasi</Label>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={saveDiscount} disabled={loading}>
                <Save className="w-4 h-4 mr-2" />{loading ? 'Menyimpan...' : 'Simpan'}
              </Button>
              <Button variant="outline" onClick={() => { setEditing(null); setIsNew(false); }}>Batal</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {loading && discounts.length === 0 ? (
          <Card className="glass-card"><CardContent className="p-8 text-center text-muted-foreground"><RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />Loading...</CardContent></Card>
        ) : discounts.length === 0 ? (
          <Card className="glass-card"><CardContent className="p-8 text-center text-muted-foreground"><Gift className="w-8 h-8 mx-auto mb-2 opacity-50" />Belum ada diskon</CardContent></Card>
        ) : (
          discounts.map((d) => (
            <Card key={d.id} className={`glass-card transition-all hover:border-primary/50 ${!d.is_active ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getDiscountTypeColor(d.discount_type)}`}>{getDiscountTypeLabel(d.discount_type)}</span>
                      {d.discount_amount > 0 ? (
                        <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400 font-bold">-{formatRupiah(d.discount_amount)}</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400 font-bold">-{d.discount_percent}%</span>
                      )}
                      {d.duration_exact && <span className="px-2 py-0.5 rounded text-xs bg-orange-500/20 text-orange-400">Only</span>}
                      {d.package_name && <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground"><Package className="w-3 h-3 inline mr-1" />{d.package_name}</span>}
                      {d.notify_users && <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400"><Bell className="w-3 h-3 inline mr-1" />Notif</span>}
                      {!d.is_active && <span className="px-2 py-0.5 rounded text-xs bg-destructive/20 text-destructive">Nonaktif</span>}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      {d.discount_type === 'duration_based' && d.min_days && (
                        <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{getRangeText(d)}</span>
                      )}
                      {d.discount_type === 'promo_code' && d.promo_code && (
                        <span className="flex items-center gap-1"><Tag className="w-4 h-4" /><code className="bg-muted px-1 rounded">{d.promo_code}</code></span>
                      )}
                      {d.description && <span className="truncate max-w-[300px]">{d.description}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => { setEditing(d); setIsNew(false); }}><Edit2 className="w-4 h-4" /></Button>
                    <Button variant="destructive" size="sm" onClick={() => deleteDiscount(d.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default DiscountManagement;

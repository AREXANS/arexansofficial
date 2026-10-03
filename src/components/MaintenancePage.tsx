import { AlertTriangle, Wrench, Key, Lock, Shield } from 'lucide-react';
import GlobalBackground from './GlobalBackground';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';

const MaintenancePage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
      <GlobalBackground />
      <div className="relative z-10 text-center max-w-md mx-auto space-y-6">
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-destructive/15 border border-destructive/30 flex items-center justify-center animate-pulse">
              <Wrench className="w-12 h-12 text-destructive" />
            </div>
            <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <Lock className="w-4 h-4 text-amber-400" />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/20 text-destructive text-xs font-bold border border-destructive/30">
            SEDANG MAINTENANCE & PERBAIKAN
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
            Sistem Sedang Dalam Pemeliharaan
          </h1>
          <p className="text-muted-foreground text-xs md:text-sm leading-relaxed">
            Website dan produk sedang dalam perbaikan rutin oleh Developer. Pembelian publik dinonaktifkan sementara.
          </p>

          <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-950/20 text-xs text-left space-y-1.5 shadow-sm">
            <div className="flex items-center gap-1.5 font-bold text-blue-300">
              <Shield className="w-4 h-4 text-blue-400" />
              <span>Proteksi Anti-Rugi Pembeli:</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Seluruh masa aktif license key pengguna yang sedang berjalan telah <strong className="text-foreground">DIBEKUKAN SEMENTARA</strong>. Durasi sisa Anda tersimpan aman dan otomatis dilanjutkan secara penuh setelah maintenance selesai.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/key-system')}
            className="text-xs rounded-xl border-primary/40 text-primary hover:bg-primary/10 gap-1.5"
          >
            <Key className="w-3.5 h-3.5" />
            Cek Status Key Anda
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/developer')}
            className="text-xs text-muted-foreground hover:text-foreground rounded-xl"
          >
            Developer Login
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MaintenancePage;

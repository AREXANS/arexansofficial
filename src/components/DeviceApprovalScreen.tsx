import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldAlert, Smartphone, Monitor, Clock, Globe } from 'lucide-react';
import GlobalBackground from '@/components/GlobalBackground';

interface DeviceApprovalScreenProps {
  deviceId: string;
  deviceName: string;
  ipAddress?: string;
  onRegister: () => Promise<boolean>;
  status: 'loading' | 'new' | 'pending';
}

const DeviceApprovalScreen = ({ deviceId, deviceName, ipAddress, onRegister, status }: DeviceApprovalScreenProps) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [waitTime, setWaitTime] = useState(0);

  useEffect(() => {
    if (status === 'pending') {
      const interval = setInterval(() => {
        setWaitTime(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const handleRegister = async () => {
    setIsRegistering(true);
    await onRegister();
    setIsRegistering(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const [showSkip, setShowSkip] = useState(false);

  useEffect(() => {
    if (status === 'loading') {
      const timer = setTimeout(() => setShowSkip(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
        <GlobalBackground />
        <Card className="w-full max-w-md z-10 glass-card">
          <CardContent className="pt-8 pb-8">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <div className="absolute -inset-2 rounded-full border-2 border-primary/30 animate-pulse" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-display font-bold text-foreground">Memeriksa Perangkat</h2>
                <p className="text-muted-foreground text-sm mt-1">Mendeteksi dan memverifikasi perangkat Anda...</p>
              </div>
              <div className="flex gap-2 mt-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              {showSkip && (
                <Button
                  onClick={handleRegister}
                  className="mt-4 w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                >
                  Lanjutkan Masuk ke Dashboard
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'new') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
        <GlobalBackground />
        <Card className="w-full max-w-md z-10 glass-card border-yellow-500/50">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mb-4">
              <ShieldAlert className="w-8 h-8 text-yellow-500" />
            </div>
            <CardTitle className="font-display text-2xl text-yellow-500">Perangkat Baru Terdeteksi</CardTitle>
            <CardDescription>Perangkat ini belum terdaftar di sistem persetujuan admin</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-xl p-4 space-y-3.5 border border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                  <Monitor className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Nama Perangkat</p>
                  <p className="text-sm font-semibold text-foreground truncate">{deviceName}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                  <Globe className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">IP Address Pengakses</p>
                  <p className="text-sm font-mono font-bold text-cyan-400 truncate">
                    {ipAddress || 'Mendeteksi IP...'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">ID Perangkat</p>
                  <p className="text-xs font-mono font-medium text-muted-foreground truncate">{deviceId}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                ⚠️ Untuk mengakses developer/admin dashboard, perangkat dan IP ini harus didaftarkan dan disetujui terlebih dahulu.
              </p>
            </div>

            <Button 
              onClick={handleRegister} 
              className="w-full font-semibold" 
              disabled={isRegistering}
            >
              {isRegistering ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Mendaftarkan...
                </>
              ) : (
                'Daftarkan Perangkat Ini'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pending status
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      <GlobalBackground />
      <Card className="w-full max-w-md z-10 glass-card border-blue-500/50">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mb-4 relative">
            <Clock className="w-8 h-8 text-blue-500 animate-pulse" />
            <div className="absolute inset-0 rounded-full border-2 border-blue-500/50 animate-ping" />
          </div>
          <CardTitle className="font-display text-2xl text-blue-500">Menunggu Persetujuan</CardTitle>
          <CardDescription>Perangkat Anda sedang menunggu persetujuan admin</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-xl p-4 space-y-3.5 border border-white/5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                <Monitor className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Nama Perangkat</p>
                <p className="text-sm font-semibold text-foreground truncate">{deviceName}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Globe className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">IP Address Pengakses</p>
                <p className="text-sm font-mono font-bold text-cyan-400 truncate">
                  {ipAddress || 'Mendeteksi IP...'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">ID Perangkat</p>
                <p className="text-xs font-mono font-medium text-muted-foreground truncate">{deviceId}</p>
              </div>
            </div>
          </div>
          
          <div className="text-center py-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 rounded-full">
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              <span className="text-sm text-blue-500">Menunggu: {formatTime(waitTime)}</span>
            </div>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <p className="text-sm text-blue-600 dark:text-blue-400 text-center">
              🔒 Harap tunggu admin menyetujui perangkat Anda. Halaman ini akan otomatis ter-refresh setelah disetujui.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div 
                  key={i}
                  className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" 
                  style={{ animationDelay: `${i * 150}ms` }} 
                />
              ))}
            </div>
            <span className="text-xs">Memeriksa status persetujuan...</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeviceApprovalScreen;

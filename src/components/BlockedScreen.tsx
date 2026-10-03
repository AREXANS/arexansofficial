import { ShieldX } from 'lucide-react';

interface BlockedScreenProps {
  reason?: string | null;
}

const BlockedScreen = ({ reason }: BlockedScreenProps) => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center">
          <ShieldX className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Akses Diblokir</h1>
        <p className="text-muted-foreground">
          IP address Anda telah diblokir dari mengakses website ini.
        </p>
        {reason && (
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            Alasan: {reason}
          </p>
        )}
        <p className="text-xs text-muted-foreground/60">
          Jika Anda merasa ini adalah kesalahan, silakan hubungi administrator.
        </p>
      </div>
    </div>
  );
};

export default BlockedScreen;

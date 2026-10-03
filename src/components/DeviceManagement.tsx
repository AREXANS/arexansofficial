import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Monitor, Smartphone, Trash2, CheckCircle2, Clock, Shield, Globe } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';

interface DeviceSession {
  id: string;
  device_id: string;
  device_name: string | null;
  device_info: Json | null;
  is_approved: boolean;
  is_current: boolean;
  login_time: string;
}

interface DeviceManagementProps {
  sessions: DeviceSession[];
  currentDeviceId: string;
  onApprove: (sessionId: string) => Promise<boolean>;
  onRemove: (sessionId: string) => Promise<boolean>;
  onRefresh: () => void;
}

// Helper to safely get device info properties
const getDeviceInfoProp = (info: Json | null, prop: string): string => {
  if (!info || typeof info !== 'object' || Array.isArray(info)) return '';
  return String((info as Record<string, Json>)[prop] || '');
};

const DeviceManagement = ({ sessions, currentDeviceId, onApprove, onRemove, onRefresh }: DeviceManagementProps) => {
  useEffect(() => {
    onRefresh();
  }, []);

  const handleApprove = async (sessionId: string, deviceName: string) => {
    const success = await onApprove(sessionId);
    if (success) {
      toast({ title: "Berhasil", description: `Perangkat "${deviceName}" telah disetujui` });
    } else {
      toast({ title: "Error", description: "Gagal menyetujui perangkat", variant: "destructive" });
    }
  };

  const handleRemove = async (sessionId: string, deviceName: string) => {
    const success = await onRemove(sessionId);
    if (success) {
      toast({ title: "Berhasil", description: `Perangkat "${deviceName}" telah dihapus` });
    } else {
      toast({ title: "Error", description: "Gagal menghapus perangkat", variant: "destructive" });
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const pendingSessions = sessions.filter(s => !s.is_approved);
  const approvedSessions = sessions.filter(s => s.is_approved);

  return (
    <div className="space-y-6">
      {/* Pending Devices */}
      {pendingSessions.length > 0 && (
        <Card className="glass-card border-yellow-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-500">
              <Clock className="w-5 h-5" />
              Perangkat Menunggu Persetujuan ({pendingSessions.length})
            </CardTitle>
            <CardDescription>Perangkat dan IP berikut sedang mencoba masuk dan memerlukan izin persetujuan admin</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingSessions.map(session => {
              const ip = getDeviceInfoProp(session.device_info, 'ip') || 'IP tidak tercatat';
              const browser = getDeviceInfoProp(session.device_info, 'browser');
              const os = getDeviceInfoProp(session.device_info, 'os');
              const res = getDeviceInfoProp(session.device_info, 'screenResolution');

              return (
                <div key={session.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Monitor className="w-5 h-5 text-yellow-500" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground text-sm sm:text-base">{session.device_name || 'Nama Perangkat Tidak Ada'}</p>
                        <Badge variant="outline" className="text-yellow-500 border-yellow-500/40 bg-yellow-500/10 text-[11px]">
                          Pending Approval
                        </Badge>
                        <Badge variant="outline" className="text-cyan-400 border-cyan-500/40 bg-cyan-500/10 font-mono text-[11px] flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {ip}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">ID: {session.device_id}</p>
                      <p className="text-xs text-muted-foreground">
                        {browser && os ? `${browser} • ${os}` : ''} {res ? `• ${res}` : ''} • Diajukan: {formatDate(session.login_time)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <Button 
                      size="sm" 
                      onClick={() => handleApprove(session.id, session.device_name || 'Unknown')}
                      className="bg-green-600 hover:bg-green-700 text-white font-medium"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                      Setujui
                    </Button>
                    <Button 
                      size="sm" 
                      variant="destructive"
                      onClick={() => handleRemove(session.id, session.device_name || 'Unknown')}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Tolak
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Approved Devices */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Perangkat Terdaftar ({approvedSessions.length})
          </CardTitle>
          <CardDescription>Daftar perangkat dan IP yang telah disetujui untuk mengakses dashboard admin / developer</CardDescription>
        </CardHeader>
        <CardContent>
          {approvedSessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Belum ada perangkat yang terdaftar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {approvedSessions.map(session => {
                const ip = getDeviceInfoProp(session.device_info, 'ip') || 'IP tidak tercatat';
                const browser = getDeviceInfoProp(session.device_info, 'browser');
                const os = getDeviceInfoProp(session.device_info, 'os');

                return (
                  <div key={session.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-muted/50 rounded-xl border border-white/5 gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Monitor className="w-5 h-5 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-foreground text-sm sm:text-base">{session.device_name || 'Nama Perangkat'}</p>
                          {session.device_id === currentDeviceId && (
                            <Badge className="bg-primary text-[11px]">Perangkat Ini</Badge>
                          )}
                          <Badge variant="outline" className="text-green-500 border-green-500/40 bg-green-500/10 text-[11px] flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Approved
                          </Badge>
                          <Badge variant="outline" className="text-cyan-400 border-cyan-500/40 bg-cyan-500/10 font-mono text-[11px] flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {ip}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">ID: {session.device_id}</p>
                        <p className="text-xs text-muted-foreground">
                          {browser && os ? `${browser} • ${os}` : ''} • Login: {formatDate(session.login_time)}
                        </p>
                      </div>
                    </div>
                    {session.device_id !== currentDeviceId && (
                      <Button 
                        size="sm" 
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 self-end sm:self-center shrink-0"
                        onClick={() => handleRemove(session.id, session.device_name || 'Unknown')}
                      >
                        <Trash2 className="w-4 h-4 mr-1.5" />
                        Hapus
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DeviceManagement;

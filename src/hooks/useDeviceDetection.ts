import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

interface DeviceInfo {
  browser: string;
  os: string;
  platform: string;
  userAgent: string;
  screenResolution: string;
  language: string;
  timezone: string;
  ip?: string;
  deviceType?: string;
  deviceModel?: string;
}

interface DeviceSession {
  id: string;
  device_id: string;
  device_name: string | null;
  device_info: Json | null;
  is_approved: boolean;
  is_current: boolean;
  login_time: string;
}

// Fetch public IP address
const fetchPublicIp = async (): Promise<string> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data?.ip) return data.ip;
    }
  } catch {
    // fallback
  }

  return '127.0.0.1';
};

// Generate a unique device fingerprint
const generateDeviceId = (): string => {
  try {
    let canvasData = '';
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('device-fingerprint', 2, 2);
        canvasData = canvas.toDataURL();
      }
    } catch {
      canvasData = 'canvas_na';
    }
    
    const sw = typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '0x0';
    const fingerprint = [
      navigator.userAgent || '',
      navigator.language || '',
      sw,
      new Date().getTimezoneOffset(),
      navigator.platform || '',
      canvasData
    ].join('|');
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return 'DEV-' + Math.abs(hash).toString(36).toUpperCase();
  } catch {
    return 'DEV-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  }
};

// Get device info for display
const getDeviceInfo = (): DeviceInfo => {
  const ua = navigator.userAgent;
  let browser = 'Browser';
  let os = 'Unknown OS';
  let deviceType = 'Desktop';
  let deviceModel = '';

  // Detect mobile / tablet
  if (/Mobi|Android/i.test(ua)) {
    deviceType = 'Mobile';
    const androidMatch = ua.match(/Android[^;]+;\s*([^;)]+)/i);
    if (androidMatch && androidMatch[1]) {
      deviceModel = androidMatch[1].trim();
    }
  } else if (/iPad|Tablet/i.test(ua)) {
    deviceType = 'Tablet';
  }

  if (/iPhone/i.test(ua)) {
    deviceType = 'Mobile';
    deviceModel = 'iPhone';
  } else if (/iPad/i.test(ua)) {
    deviceType = 'Tablet';
    deviceModel = 'iPad';
  }
  
  // Detect browser
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
  else if (ua.includes('OPR/') || ua.includes('Opera/')) browser = 'Opera';
  
  // Detect OS
  if (ua.includes('Windows NT 10.0') || ua.includes('Windows NT 11.0')) os = 'Windows 10/11';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Macintosh') || ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Android')) os = deviceModel ? `Android (${deviceModel})` : 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';
  
  return {
    browser,
    os,
    platform: navigator.platform,
    userAgent: ua,
    screenResolution: `${screen.width}x${screen.height}`,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    deviceType,
    deviceModel
  };
};

// Generate device name
const getDeviceName = (): string => {
  const info = getDeviceInfo();
  if (info.deviceModel) {
    return `${info.deviceModel} (${info.browser} • ${info.os})`;
  }
  return `${info.browser} on ${info.os} [${info.deviceType}]`;
};

export const useDeviceDetection = () => {
  const [deviceId] = useState(() => {
    // Try to get existing device ID from localStorage
    let id = localStorage.getItem('admin_device_id');
    if (!id) {
      id = generateDeviceId();
      localStorage.setItem('admin_device_id', id);
    }
    return id;
  });
  
  // Public IP state
  const [ipAddress, setIpAddress] = useState<string>('Mendeteksi IP...');

  useEffect(() => {
    let active = true;
    fetchPublicIp().then((ip) => {
      if (active) setIpAddress(ip);
    });
    return () => { active = false; };
  }, []);
  
  // Check for persistent admin session
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('admin_logged_in') === 'true';
  });
  
  const [deviceStatus, setDeviceStatus] = useState<'loading' | 'approved' | 'pending' | 'new'>(() => {
    let id = localStorage.getItem('admin_device_id');
    if (!id) return 'loading';
    if (localStorage.getItem(`admin_device_approved_${id}`) === 'true' || localStorage.getItem('admin_logged_in') === 'true') {
      return 'approved';
    }
    return 'loading';
  });
  const [currentSession, setCurrentSession] = useState<DeviceSession | null>(null);
  const [allSessions, setAllSessions] = useState<DeviceSession[]>([]);
  const [isChecking, setIsChecking] = useState(true);
  
  const persistLogin = () => {
    setIsLoggedIn(true);
    setDeviceStatus('approved');
  };
  
  const clearLogin = () => {
    setIsLoggedIn(false);
    setDeviceStatus('new');
  };

  const deviceInfo = getDeviceInfo();
  const deviceName = getDeviceName();

  const checkDeviceStatus = useCallback(async () => {
    setIsChecking(true);

    try {
      const timeoutPromise = new Promise<{ data: null; error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 1000)
      );

      const queryPromise = supabase
        .from('admin_sessions')
        .select('*')
        .eq('device_id', deviceId);

      const result: any = await Promise.race([queryPromise, timeoutPromise]);
      const { data: sessions, error } = result || {};

      if (error) {
        setDeviceStatus('new');
        setIsChecking(false);
        return;
      }

      if (sessions && sessions.length > 0) {
        const session = sessions[0] as unknown as DeviceSession;
        setCurrentSession(session);
        
        if (session.is_approved) {
          setDeviceStatus('approved');
        } else {
          setDeviceStatus('pending');
        }
      } else {
        setDeviceStatus('new');
      }
    } catch {
      setDeviceStatus('new');
    } finally {
      setIsChecking(false);
    }
  }, [deviceId]);

  const registerDevice = async () => {
    try {
      // Check if there are any existing approved devices
      const { data: existingSessions } = await supabase
        .from('admin_sessions')
        .select('id')
        .eq('is_approved', true);
      
      // If no approved devices exist, auto-approve the first one
      const isFirstDevice = !existingSessions || existingSessions.length === 0;
      
      const currentIp = (ipAddress && ipAddress !== 'Mendeteksi IP...') ? ipAddress : '127.0.0.1';

      const deviceInfoJson: Json = {
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        platform: deviceInfo.platform,
        userAgent: deviceInfo.userAgent,
        screenResolution: deviceInfo.screenResolution,
        language: deviceInfo.language,
        timezone: deviceInfo.timezone,
        ip: currentIp,
        deviceType: deviceInfo.deviceType,
        deviceModel: deviceInfo.deviceModel
      };
      
      const { data, error } = await supabase
        .from('admin_sessions')
        .insert([{
          device_id: deviceId,
          device_name: deviceName,
          device_info: deviceInfoJson,
          is_approved: isFirstDevice, // Auto-approve first device
          is_current: true
        }])
        .select()
        .single();
      
      if (error) {
        console.warn('Error registering device to DB, approving locally:', error);
        localStorage.setItem(`admin_device_approved_${deviceId}`, 'true');
        setDeviceStatus('approved');
        return true;
      }
      
      if (data) setCurrentSession(data as DeviceSession);
      
      if (isFirstDevice) {
        localStorage.setItem(`admin_device_approved_${deviceId}`, 'true');
        setDeviceStatus('approved');
      } else {
        setDeviceStatus('pending');
      }
      
      return true;
    } catch {
      localStorage.setItem(`admin_device_approved_${deviceId}`, 'true');
      setDeviceStatus('approved');
      return true;
    }
  };

  const loadAllSessions = async () => {
    const { data, error } = await supabase
      .from('admin_sessions')
      .select('*')
      .order('login_time', { ascending: false });
    
    if (error) {
      console.error('Error loading sessions:', error);
      return;
    }
    
    setAllSessions((data || []) as unknown as DeviceSession[]);
  };

  const approveDevice = async (sessionIdOrDeviceId?: string) => {
    const target = sessionIdOrDeviceId || deviceId;
    const currentIp = (ipAddress && ipAddress !== 'Mendeteksi IP...') ? ipAddress : '127.0.0.1';
    const deviceInfoJson: Json = {
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      platform: deviceInfo.platform,
      userAgent: deviceInfo.userAgent,
      screenResolution: deviceInfo.screenResolution,
      language: deviceInfo.language,
      timezone: deviceInfo.timezone,
      ip: currentIp,
      deviceType: deviceInfo.deviceType,
      deviceModel: deviceInfo.deviceModel
    };

    try {
      const { data: updated } = await supabase
        .from('admin_sessions')
        .update({ is_approved: true, is_current: true })
        .or(`id.eq.${target},device_id.eq.${target}`)
        .select();

      if (!updated || updated.length === 0) {
        await supabase
          .from('admin_sessions')
          .insert([{
            id: target.startsWith('DEV-') ? `session-${target}` : target,
            device_id: deviceId,
            device_name: deviceName,
            device_info: deviceInfoJson,
            is_approved: true,
            is_current: true
          }]);
      }
    } catch (e) {
      console.warn('DB approve device error:', e);
    }

    setDeviceStatus('approved');
    await loadAllSessions();
    return true;
  };

  const removeDevice = async (sessionId: string) => {
    const { error } = await supabase
      .from('admin_sessions')
      .delete()
      .eq('id', sessionId);
    
    if (error) {
      console.error('Error removing device:', error);
      return false;
    }
    
    await loadAllSessions();
    return true;
  };

  // Poll for approval status when pending
  useEffect(() => {
    if (deviceStatus !== 'pending') return;
    
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('admin_sessions')
        .select('is_approved')
        .eq('device_id', deviceId)
        .single();
      
      if (data?.is_approved) {
        setDeviceStatus('approved');
        clearInterval(interval);
      }
    }, 3000);
    
    return () => clearInterval(interval);
  }, [deviceStatus, deviceId]);

  useEffect(() => {
    checkDeviceStatus();
  }, [checkDeviceStatus]);

  return {
    deviceId,
    deviceName,
    deviceInfo,
    ipAddress,
    deviceStatus,
    currentSession,
    allSessions,
    isChecking,
    isLoggedIn,
    registerDevice,
    loadAllSessions,
    approveDevice,
    removeDevice,
    checkDeviceStatus,
    persistLogin,
    clearLogin
  };
};

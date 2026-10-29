import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xs';
}

// 1. QRIS National Logo
export const QrisLogo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  const height = size === 'xs' ? 'h-3.5' : size === 'sm' ? 'h-4' : size === 'lg' ? 'h-7' : 'h-5';
  return (
    <div className={`inline-flex items-center justify-center bg-white px-2 py-0.5 rounded shadow-sm border border-neutral-200 select-none ${className}`}>
      <span className="font-black text-black tracking-tighter text-[11px] leading-none flex items-center gap-0.5">
        <span className="text-red-600 font-extrabold text-[12px]">Q</span>RIS
      </span>
      <span className="text-[7px] text-neutral-500 font-bold ml-1 uppercase tracking-tight hidden sm:inline">Nasional</span>
    </div>
  );
};

// 2. Visa Official Stylized Logo
export const VisaLogo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  const h = size === 'xs' ? 'h-3' : size === 'sm' ? 'h-4' : size === 'lg' ? 'h-6' : 'h-5';
  return (
    <div className={`inline-flex items-center justify-center bg-[#1A1F71] text-white px-2 py-0.5 rounded font-black tracking-wider text-[11px] italic shadow-sm select-none ${h} ${className}`}>
      <span className="tracking-widest">VISA</span>
    </div>
  );
};

// 3. Mastercard Official Interlocking Circles Logo
export const MastercardLogo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  const h = size === 'xs' ? 14 : size === 'sm' ? 18 : size === 'lg' ? 24 : 20;
  return (
    <div className={`inline-flex items-center justify-center bg-[#141414] px-1.5 py-0.5 rounded shadow-sm border border-neutral-700/50 select-none ${className}`}>
      <svg width={h * 1.5} height={h} viewBox="0 0 36 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" fill="#EB001B" />
        <circle cx="24" cy="12" r="10" fill="#F79E1B" fillOpacity="0.9" />
        <path d="M18 5.7A10 10 0 0 1 21.9 12A10 10 0 0 1 18 18.3A10 10 0 0 1 14.1 12A10 10 0 0 1 18 5.7Z" fill="#FF5F00" />
      </svg>
    </div>
  );
};

// 4. JCB Logo
export const JcbLogo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  return (
    <div className={`inline-flex items-center justify-center bg-white px-1.5 py-0.5 rounded shadow-sm border border-neutral-200 select-none ${className}`}>
      <span className="font-extrabold text-[10px] tracking-tight flex gap-0.5">
        <span className="text-[#0E4C92]">J</span>
        <span className="text-[#D32F2F]">C</span>
        <span className="text-[#2E7D32]">B</span>
      </span>
    </div>
  );
};

// 5. Akulaku Official Red Badge Logo
export const AkulakuLogo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  return (
    <div className={`inline-flex items-center gap-1 bg-[#E60012] text-white px-2 py-0.5 rounded-md font-bold text-[11px] shadow-sm select-none ${className}`}>
      <span className="w-2.5 h-2.5 rounded-full bg-white text-[#E60012] flex items-center justify-center text-[8px] font-black">a</span>
      <span className="tracking-tight">akulaku</span>
    </div>
  );
};

// 6. Bank Specific Logos with Indonesian Banking Brand Aesthetics
export const BankLogo: React.FC<{ bank: string; size?: 'sm' | 'md' | 'lg' | 'xs'; className?: string; showName?: boolean }> = ({
  bank,
  size = 'md',
  className = '',
  showName = false
}) => {
  const code = (bank || '').trim().toUpperCase();

  const getBankConfig = () => {
    switch (code) {
      case 'BRI':
        return {
          bg: 'bg-[#00529C]',
          textColor: 'text-white',
          border: 'border-[#003B70]',
          short: 'BRI',
          fullName: 'Bank BRI',
          sub: 'BANK RAKYAT INDONESIA',
          accent: 'bg-[#F37021]',
        };
      case 'BNI':
        return {
          bg: 'bg-white',
          textColor: 'text-[#005E6A]',
          border: 'border-[#005E6A]/30',
          short: 'BNI',
          fullName: 'Bank BNI',
          sub: '46',
          accent: 'bg-[#F15A24]',
        };
      case 'BCA':
        return {
          bg: 'bg-[#003B73]',
          textColor: 'text-white',
          border: 'border-[#002D5A]',
          short: 'BCA',
          fullName: 'Bank BCA',
          sub: 'CENTRAL ASIA',
          accent: 'bg-white',
        };
      case 'MANDIRI':
        return {
          bg: 'bg-[#00204E]',
          textColor: 'text-[#F5A623]',
          border: 'border-[#00183C]',
          short: 'mandiri',
          fullName: 'Bank Mandiri',
          sub: 'TERDEPAN',
          accent: 'bg-[#F5A623]',
        };
      case 'PERMATA':
        return {
          bg: 'bg-white',
          textColor: 'text-[#008542]',
          border: 'border-[#008542]/30',
          short: 'Permata',
          fullName: 'Bank Permata',
          sub: 'BANK',
          accent: 'bg-[#E30613]',
        };
      case 'CIMB':
        return {
          bg: 'bg-[#ED1C24]',
          textColor: 'text-white',
          border: 'border-[#C81017]',
          short: 'CIMB',
          fullName: 'CIMB Niaga',
          sub: 'NIAGA',
          accent: 'bg-white',
        };
      case 'DANAMON':
        return {
          bg: 'bg-[#F26522]',
          textColor: 'text-white',
          border: 'border-[#D94F0D]',
          short: 'Danamon',
          fullName: 'Bank Danamon',
          sub: 'MUFG',
          accent: 'bg-[#004B87]',
        };
      case 'BTN':
        return {
          bg: 'bg-[#003A70]',
          textColor: 'text-white',
          border: 'border-[#00264A]',
          short: 'BTN',
          fullName: 'Bank BTN',
          sub: 'SAHABAT KELUARGA',
          accent: 'bg-[#ED1C24]',
        };
      case 'MAYBANK':
        return {
          bg: 'bg-[#FFCC00]',
          textColor: 'text-black',
          border: 'border-[#E6B800]',
          short: 'Maybank',
          fullName: 'Maybank',
          sub: 'INDONESIA',
          accent: 'bg-black',
        };
      case 'BJB':
        return {
          bg: 'bg-[#004481]',
          textColor: 'text-white',
          border: 'border-[#003366]',
          short: 'bjb',
          fullName: 'bank bjb',
          sub: 'TANDAMATA',
          accent: 'bg-[#FFCC00]',
        };
      case 'SINARMAS':
        return {
          bg: 'bg-white',
          textColor: 'text-[#D71920]',
          border: 'border-[#D71920]/30',
          short: 'Sinarmas',
          fullName: 'Bank Sinarmas',
          sub: 'FINANCIAL',
          accent: 'bg-[#D71920]',
        };
      case 'BNC':
      case 'NEO':
        return {
          bg: 'bg-[#FFE600]',
          textColor: 'text-black',
          border: 'border-yellow-400',
          short: 'neo:commerce',
          fullName: 'Bank Neo Commerce',
          sub: 'BNC',
          accent: 'bg-black',
        };
      default:
        return {
          bg: 'bg-neutral-800',
          textColor: 'text-white',
          border: 'border-neutral-700',
          short: code,
          fullName: `Bank ${code}`,
          sub: 'VA',
          accent: 'bg-primary',
        };
    }
  };

  const cfg = getBankConfig();
  const textSz = size === 'xs' ? 'text-[9px]' : size === 'sm' ? 'text-[10px]' : size === 'lg' ? 'text-xs' : 'text-[11px]';
  const pad = size === 'xs' ? 'px-1.5 py-0.5' : size === 'sm' ? 'px-2 py-0.5' : size === 'lg' ? 'px-3 py-1' : 'px-2 py-0.5';

  return (
    <div className={`inline-flex items-center gap-1.5 select-none ${className}`}>
      <div className={`inline-flex items-center justify-center ${cfg.bg} ${cfg.textColor} ${cfg.border} border ${pad} rounded-md font-black tracking-tight ${textSz} shadow-sm font-sans shrink-0`}>
        {cfg.short}
      </div>
      {showName && (
        <span className="font-semibold text-xs text-foreground tracking-tight">
          {cfg.fullName}
        </span>
      )}
    </div>
  );
};

// 7. Strip of Popular Indonesian Bank Logos (e.g. for checkout preview)
export const PopularBankLogos: React.FC<{ limit?: number; className?: string }> = ({ limit = 6, className = '' }) => {
  const banks = ['BRI', 'BNI', 'BCA', 'MANDIRI', 'PERMATA', 'CIMB', 'DANAMON', 'BTN'].slice(0, limit);
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {banks.map((b) => (
        <BankLogo key={b} bank={b} size="xs" />
      ))}
      <span className="text-[10px] text-muted-foreground font-medium ml-0.5">+4 Bank Lainnya</span>
    </div>
  );
};

// 8. Strip of Credit / Debit Cards & Paylater
export const CardAndPaylaterBadges: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <VisaLogo size="xs" />
      <MastercardLogo size="xs" />
      <JcbLogo size="xs" />
      <AkulakuLogo size="xs" />
    </div>
  );
};

// 9. Strip of E-Wallet Badges for QRIS
export const EWalletBadges: React.FC<{ className?: string }> = ({ className = '' }) => {
  const wallets = [
    { name: 'GoPay', bg: 'bg-[#00AED6]', text: 'text-white' },
    { name: 'OVO', bg: 'bg-[#4C3494]', text: 'text-white' },
    { name: 'DANA', bg: 'bg-[#118EEA]', text: 'text-white' },
    { name: 'ShopeePay', bg: 'bg-[#EE4D2D]', text: 'text-white' },
    { name: 'LinkAja', bg: 'bg-[#ED1C24]', text: 'text-white' },
  ];

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      <QrisLogo size="xs" />
      {wallets.map((w) => (
        <span
          key={w.name}
          className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${w.bg} ${w.text} shadow-sm select-none`}
        >
          {w.name}
        </span>
      ))}
    </div>
  );
};

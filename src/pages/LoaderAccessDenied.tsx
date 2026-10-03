import { useEffect, useState } from "react";

const LoaderAccessDenied = () => {
  const [scriptName, setScriptName] = useState<string>("unknown");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get("name");
    if (name) setScriptName(name);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans flex items-center justify-center overflow-hidden relative">
      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,0,0,0.03) 1px,transparent 1px), linear-gradient(90deg,rgba(255,0,0,0.03) 1px,transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      {/* Glow effects */}
      <div className="absolute w-[300px] h-[300px] rounded-full blur-[120px] opacity-15 bg-red-600 top-[10%] left-[20%]" />
      <div className="absolute w-[300px] h-[300px] rounded-full blur-[120px] opacity-15 bg-red-500 bottom-[15%] right-[15%]" />
      <div className="absolute w-[200px] h-[200px] rounded-full blur-[120px] opacity-15 bg-red-700 top-[50%] left-[60%]" />

      <div className="text-center z-10 px-8 max-w-[520px]">
        <div className="inline-block px-6 py-2 border border-red-500/40 rounded-full text-[13px] tracking-[3px] text-red-400 mb-7 bg-red-500/10">
          4 0 3 &nbsp; E R R O R
        </div>
        <h1 className="text-4xl md:text-6xl font-light mb-5 leading-tight">
          Access <strong className="font-bold">Denied</strong>
        </h1>
        <p className="text-gray-500 text-[15px] leading-7 mb-5">
          You don't have permission to access this resource.
          <br />
          <span className="text-red-400 font-medium">@arexans</span> protected endpoint
        </p>
        <div className="text-gray-600 text-xs tracking-widest mb-8">
          Requested: <span className="text-red-400 font-medium">{scriptName}</span>
        </div>
        <a
          href="/"
          className="inline-flex items-center gap-2 px-7 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm no-underline transition-all hover:bg-red-500/20 hover:border-red-500/50 hover:-translate-y-0.5"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          Return Home
        </a>
        <div className="mt-10 text-gray-600 text-xs tracking-widest">AREXANS SECURITY SYSTEM</div>
      </div>
    </div>
  );
};

export default LoaderAccessDenied;

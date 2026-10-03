import { FC, useEffect, useRef } from 'react';
import { useBackground } from '@/contexts/BackgroundContext';

interface GlobalBackgroundProps {
  variant?: 'default' | 'success';
}

const GlobalBackground: FC<GlobalBackgroundProps> = ({ variant = 'default' }) => {
  const { currentBackground, nextBackground, activeBackgrounds } = useBackground();
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleVideoEnd = () => {
    if (activeBackgrounds.length > 1) {
      nextBackground();
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || currentBackground?.background_type !== 'video') return;

    const url = currentBackground.background_url;
    if (!url) return;

    const nextSrc = url;
    if (video.src !== nextSrc) {
      video.src = nextSrc;
    }

    video.volume = 1;
    video.muted = !!currentBackground.is_muted;

    let cancelled = false;

    const tryPlay = async () => {
      try {
        await video.play();
      } catch {
        if (!video.muted) {
          video.muted = true;
          try {
            await video.play();
          } catch {
            /* ignore */
          }
        }
      }
    };

    const onCanPlay = () => {
      if (!cancelled) void tryPlay();
    };

    video.addEventListener('canplay', onCanPlay);
    if (video.readyState >= 3) {
      void tryPlay();
    }

    return () => {
      cancelled = true;
      video.removeEventListener('canplay', onCanPlay);
    };
  }, [currentBackground]);

  const glowColor = variant === 'success' ? 'hsl(142 76% 45% / 0.18)' : 'hsl(210 100% 55% / 0.22)';

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      {/* Deep gradient base */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, hsl(222 60% 5%), hsl(222 65% 3%))' }}
      />

      {/* Animated aurora blue gradient */}
      <div
        className="absolute inset-0 opacity-60 animate-aurora"
        style={{
          background:
            'linear-gradient(120deg, hsl(220 100% 30% / 0.55) 0%, hsl(200 100% 40% / 0.35) 35%, hsl(190 100% 50% / 0.3) 70%, hsl(220 100% 40% / 0.5) 100%)',
          backgroundSize: '300% 300%',
        }}
      />

      {/* Floating blue blobs */}
      <div
        className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full blur-3xl opacity-40 animate-blob"
        style={{ background: 'radial-gradient(circle, hsl(210 100% 55% / 0.8), transparent 65%)' }}
      />
      <div
        className="absolute top-1/3 -right-40 w-[560px] h-[560px] rounded-full blur-3xl opacity-35 animate-blob"
        style={{
          background: 'radial-gradient(circle, hsl(195 100% 55% / 0.75), transparent 65%)',
          animationDelay: '4s',
        }}
      />
      <div
        className="absolute -bottom-40 left-1/4 w-[600px] h-[600px] rounded-full blur-3xl opacity-30 animate-blob"
        style={{
          background: 'radial-gradient(circle, hsl(220 100% 60% / 0.7), transparent 65%)',
          animationDelay: '8s',
        }}
      />

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(hsl(200 100% 70%) 1px, transparent 1px), linear-gradient(90deg, hsl(200 100% 70%) 1px, transparent 1px)",
          backgroundSize: '48px 48px',
        }}
      />

      {/* Center glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at center, ${glowColor}, transparent 70%)` }}
      />

      {/* Video background */}
      {currentBackground?.background_type === 'video' && currentBackground.background_url && (
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover opacity-25"
          loop={activeBackgrounds.length === 1}
          playsInline
          onEnded={handleVideoEnd}
        />
      )}

      {/* Image background */}
      {currentBackground?.background_type === 'image' && currentBackground.background_url && (
        <img
          src={currentBackground.background_url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-25"
        />
      )}

      {/* Readability overlay */}
      <div className="absolute inset-0 bg-background/40" />
    </div>
  );
};

export default GlobalBackground;

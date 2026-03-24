import debug from "debug";
import { useCallback, useEffect, useRef, useState } from "react";

const log = debug("neovate:splash");

const SPLASH_VIDEO_URL =
  "https://gw.alipayobjects.com/v/huamei_9rin5s/afts/video/6QfSRIjplAIAAAAAchAAAAgAfoeUAQBr";
const SPLASH_SHOWN_KEY = "neovate:splash-shown";

interface SplashScreenProps {
  children: React.ReactNode;
}

export function SplashScreen({ children }: SplashScreenProps) {
  const [showSplash, setShowSplash] = useState<boolean | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const hasShown = localStorage.getItem(SPLASH_SHOWN_KEY);
    log("splash check", { hasShown, willShow: !hasShown });
    setShowSplash(!hasShown);

    // Dev mode: Shift+Ctrl+S to reset splash screen for testing
    if (import.meta.env.DEV) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.shiftKey && e.ctrlKey && e.key === "S") {
          localStorage.removeItem(SPLASH_SHOWN_KEY);
          window.location.reload();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
    return undefined;
  }, []);

  const handleVideoEnd = useCallback(() => {
    log("video ended");
    setIsExiting(true);
    localStorage.setItem(SPLASH_SHOWN_KEY, "1");
  }, []);

  // Handle video load error - skip splash
  const handleVideoError = useCallback(() => {
    log("video error");
    localStorage.setItem(SPLASH_SHOWN_KEY, "1");
    setShowSplash(false);
  }, []);

  // Video has enough data to play smoothly
  const handleCanPlayThrough = useCallback(() => {
    log("video can play through");
    setIsVideoReady(true);
  }, []);

  // Allow skip on click
  const handleSkip = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsExiting(true);
    localStorage.setItem(SPLASH_SHOWN_KEY, "1");
  }, []);

  // Handle exit transition end
  const handleTransitionEnd = useCallback(() => {
    if (isExiting) {
      setShowSplash(false);
    }
  }, [isExiting]);

  // Still loading state check
  if (showSplash === null) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="animate-spin size-6 border-2 border-white/20 border-t-white/60 rounded-full" />
      </div>
    );
  }

  if (!showSplash) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Splash screen overlay */}
      <div
        className="fixed inset-0 z-[9999] bg-black cursor-pointer"
        style={{
          opacity: isExiting ? 0 : 1,
          transition: "opacity 600ms ease-out",
        }}
        onClick={handleSkip}
        onTransitionEnd={handleTransitionEnd}
      >
        {/* Loading state while video loads */}
        {!isVideoReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin size-8 border-2 border-white/20 border-t-white/60 rounded-full" />
          </div>
        )}

        {/* Video player - cover entire screen without distortion */}
        <video
          ref={videoRef}
          src={SPLASH_VIDEO_URL}
          autoPlay
          muted
          playsInline
          preload="auto"
          onCanPlayThrough={handleCanPlayThrough}
          onEnded={handleVideoEnd}
          onError={handleVideoError}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            opacity: isVideoReady ? 1 : 0,
            transition: "opacity 300ms ease-out",
          }}
        />
      </div>

      {/* Main app content - render underneath */}
      <div
        style={{
          opacity: isExiting ? 1 : 0,
          transition: "opacity 600ms ease-out",
        }}
      >
        {children}
      </div>
    </>
  );
}

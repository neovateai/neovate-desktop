import { ArrowLeft, ArrowRight, MousePointerClick, PanelBottom, RefreshCw } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

interface NavBarProps {
  url: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  enableInspect?: boolean;
  isInspecting: boolean;
  isDevToolsOpen: boolean;
  onNavigate: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  onToggleDevTools: () => void;
  onToggleInspector: () => void;
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//.test(trimmed)) return trimmed;
  if (trimmed.startsWith("localhost") || trimmed.startsWith("127.0.0.1")) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
}

export function NavBar({
  url,
  isLoading,
  enableInspect,
  canGoBack,
  canGoForward,
  isInspecting,
  isDevToolsOpen,
  onNavigate,
  onGoBack,
  onGoForward,
  onReload,
  onToggleDevTools,
  onToggleInspector,
}: NavBarProps) {
  const { t } = useTranslation("plugin-browser");
  const [inputValue, setInputValue] = useState(url);
  const [isEditing, setIsEditing] = useState(false);

  // Sync when url prop changes and user is not editing
  useEffect(() => {
    if (!isEditing) setInputValue(url);
  }, [url, isEditing]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setIsEditing(false);
    const normalized = normalizeUrl(inputValue);
    if (normalized) onNavigate(normalized);
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-0.5 border-b px-1 py-1">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!canGoBack || isLoading}
        onClick={onGoBack}
        aria-label={t("nav.back")}
      >
        <ArrowLeft className="size-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!canGoForward || isLoading}
        onClick={onGoForward}
        aria-label={t("nav.forward")}
      >
        <ArrowRight className="size-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        disabled={isLoading}
        onClick={onReload}
        aria-label={t("nav.refresh")}
      >
        <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
      </Button>

      <Input
        size="sm"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={(e) => {
          setIsEditing(true);
          (e.target as HTMLInputElement).select();
        }}
        onBlur={() => {
          setIsEditing(false);
          setInputValue(url);
        }}
        placeholder={t("nav.addressPlaceholder")}
        className="mx-1 flex-1 bg-muted/30 focus-within:bg-transparent"
      />

      {enableInspect && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleInspector}
          aria-label={t("nav.inspect")}
          className={isInspecting ? "bg-muted" : ""}
        >
          <MousePointerClick className="size-4" />
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onToggleDevTools}
        aria-label={t("nav.devtools")}
        className={isDevToolsOpen ? "bg-muted" : ""}
      >
        <PanelBottom className="size-4" />
      </Button>
    </form>
  );
}

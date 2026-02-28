import { Activity, type ReactNode, useEffect, useRef, useState } from "react";
import { useLayoutStore } from "./use-layout-store";

type AppLayoutPanelActivityProps = {
  active: boolean;
  enabled?: boolean;
  hideDelayMs?: number;
  children: ReactNode;
};

type AppLayoutAutoPanelActivityProps = {
  enabled?: boolean;
  hideDelayMs?: number;
  children: ReactNode;
};

export function AppLayoutPanelActivity({
  active,
  enabled = true,
  hideDelayMs = 220,
  children,
}: AppLayoutPanelActivityProps) {
  const [visible, setVisible] = useState(active);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    if (active) {
      setVisible(true);
      return;
    }

    // Delay hiding so panel collapse animation can finish before Activity applies display:none.
    hideTimeoutRef.current = setTimeout(() => {
      setVisible(false);
      hideTimeoutRef.current = null;
    }, hideDelayMs);

    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    };
  }, [active, hideDelayMs]);

  if (!enabled) {
    return <>{children}</>;
  }

  return <Activity mode={visible ? "visible" : "hidden"}>{children}</Activity>;
}

export function AppLayoutContentPanelActivity({
  enabled = true,
  hideDelayMs = 220,
  children,
}: AppLayoutAutoPanelActivityProps) {
  const collapsed = useLayoutStore((s) => s.panels.contentPanel?.collapsed ?? false);

  return (
    <AppLayoutPanelActivity active={!collapsed} enabled={enabled} hideDelayMs={hideDelayMs}>
      {children}
    </AppLayoutPanelActivity>
  );
}

export function AppLayoutSecondarySidebarActivity({
  enabled = true,
  hideDelayMs = 220,
  children,
}: AppLayoutAutoPanelActivityProps) {
  const collapsed = useLayoutStore((s) => s.panels.secondarySidebar?.collapsed ?? false);

  return (
    <AppLayoutPanelActivity active={!collapsed} enabled={enabled} hideDelayMs={hideDelayMs}>
      {children}
    </AppLayoutPanelActivity>
  );
}

import debug from "debug";
import { Keyboard, Lock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../../../components/ui/button";
import {
  captureKeybinding,
  DEFAULT_KEYBINDINGS,
  formatKeyForDisplay,
  KEYBINDING_LABEL_KEYS,
  type KeybindingAction,
  READONLY_ACTIONS,
} from "../../../../lib/keybindings";
import { cn } from "../../../../lib/utils";
import { useConfigStore } from "../../../config/store";

const log = debug("neovate:settings:keybindings");

const KEYBINDING_ACTIONS: KeybindingAction[] = [
  "openSettings",
  "newChat",
  "toggleChanges",
  "toggleTerminal",
  "toggleBrowser",
  "toggleFiles",
  "toggleMultiProject",
  "prevSession",
  "nextSession",
  "copyPath",
  "closeSettings",
  "toggleTheme",
  "clearTerminal",
];

// Actions that can be customized by user
const EDITABLE_ACTIONS = KEYBINDING_ACTIONS.filter((action) => !READONLY_ACTIONS.includes(action));

interface KeyBadgeProps {
  keyStr: string;
}

const KeyBadge = ({ keyStr }: KeyBadgeProps) => (
  <span className="inline-flex items-center justify-center min-w-6 px-1.5 py-0.5 rounded text-xs font-medium bg-muted border border-border text-foreground">
    {keyStr}
  </span>
);

interface KeybindingDisplayProps {
  binding: string;
}

const KeybindingDisplay = ({ binding }: KeybindingDisplayProps) => {
  const keys = formatKeyForDisplay(binding);
  return (
    <div className="flex items-center gap-1">
      {keys.map((key, index) => (
        <KeyBadge key={index} keyStr={key} />
      ))}
    </div>
  );
};

interface KeybindingRowProps {
  action: KeybindingAction;
  binding: string;
  isReadonly: boolean;
  isRecording: boolean;
  conflict: string | null;
  onStartRecording: () => void;
  onStopRecording: (newBinding: string | null) => void;
}

const KeybindingRow = ({
  action,
  binding,
  isReadonly,
  isRecording,
  conflict,
  onStartRecording,
  onStopRecording,
}: KeybindingRowProps) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels recording
      if (e.key === "Escape") {
        onStopRecording(null);
        return;
      }

      const captured = captureKeybinding(e);
      if (captured) {
        onStopRecording(captured);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isRecording, onStopRecording]);

  return (
    <div className="flex items-center justify-between py-4 border-b border-border last:border-b-0">
      <div className="flex-1 flex items-center gap-2">
        <div>
          <div
            className={cn(
              "text-sm font-medium flex items-center gap-1.5",
              isReadonly ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {t(KEYBINDING_LABEL_KEYS[action])}
            {isReadonly && <Lock className="size-3 text-muted-foreground" />}
          </div>
          {conflict && (
            <div className="text-xs mt-0.5 text-destructive">
              {t("settings.keybindings.conflict", { action: conflict })}
            </div>
          )}
        </div>
      </div>
      <div className="flex-shrink-0">
        {isRecording ? (
          <div className="px-3 py-1.5 rounded text-sm animate-pulse bg-accent text-foreground">
            {t("settings.keybindings.pressShortcut")}
          </div>
        ) : isReadonly ? (
          // Read-only display (no hover, no click)
          <div className="flex items-center gap-1 px-2 py-1 cursor-default">
            <KeybindingDisplay binding={binding} />
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartRecording}
            className="flex items-center gap-1 px-2 py-1 rounded transition-colors cursor-pointer bg-transparent hover:bg-accent"
          >
            <KeybindingDisplay binding={binding} />
          </button>
        )}
      </div>
    </div>
  );
};

export const KeybindingsPanel = () => {
  const { t } = useTranslation();
  const keybindings = useConfigStore((state) => state.keybindings);
  const setKeybinding = useConfigStore((state) => state.setKeybinding);
  const resetKeybindings = useConfigStore((state) => state.resetKeybindings);

  const [recordingAction, setRecordingAction] = useState<KeybindingAction | null>(null);
  const [conflictInfo, setConflictInfo] = useState<{
    action: KeybindingAction;
    conflictWith: string;
  } | null>(null);

  const findConflict = useCallback(
    (newBinding: string, forAction: KeybindingAction): string | null => {
      for (const action of KEYBINDING_ACTIONS) {
        if (action !== forAction && keybindings[action] === newBinding) {
          return t(KEYBINDING_LABEL_KEYS[action]);
        }
      }
      return null;
    },
    [keybindings, t],
  );

  const handleStartRecording = (action: KeybindingAction) => {
    setRecordingAction(action);
    setConflictInfo(null);
  };

  const handleStopRecording = (action: KeybindingAction, newBinding: string | null) => {
    setRecordingAction(null);

    if (!newBinding) return; // Cancelled

    const conflict = findConflict(newBinding, action);
    if (conflict) {
      log(
        "keybinding conflict: action=%s binding=%s conflicts with %s",
        action,
        newBinding,
        conflict,
      );
      setConflictInfo({ action, conflictWith: conflict });
      // Don't save, just show error
      return;
    }

    log("keybinding set: action=%s binding=%s", action, newBinding);
    setConflictInfo(null);
    setKeybinding(action, newBinding);
  };

  const handleReset = () => {
    log("resetting all keybindings to defaults");
    resetKeybindings();
    setConflictInfo(null);
  };

  const hasCustomBindings = EDITABLE_ACTIONS.some(
    (action) => keybindings[action] !== DEFAULT_KEYBINDINGS[action],
  );

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6 flex items-center gap-2 text-foreground">
        <Keyboard className="size-[22px]" />
        {t("settings.keybindings")}
      </h1>

      <div className="space-y-0">
        {KEYBINDING_ACTIONS.map((action) => (
          <KeybindingRow
            key={action}
            action={action}
            binding={keybindings[action] ?? DEFAULT_KEYBINDINGS[action]}
            isReadonly={READONLY_ACTIONS.includes(action)}
            isRecording={recordingAction === action}
            conflict={conflictInfo?.action === action ? conflictInfo.conflictWith : null}
            onStartRecording={() => handleStartRecording(action)}
            onStopRecording={(newBinding) => handleStopRecording(action, newBinding)}
          />
        ))}
      </div>

      {hasCustomBindings && (
        <div className="mt-6 flex justify-end">
          <Button variant="outline" size="sm" onClick={handleReset}>
            {t("settings.keybindings.resetToDefaults")}
          </Button>
        </div>
      )}
    </div>
  );
};

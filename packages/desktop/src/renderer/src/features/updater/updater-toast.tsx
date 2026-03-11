import { useEffect, useRef } from "react";

import { toastManager } from "../../components/ui/toast";
import { client } from "../../orpc";
import { useUpdaterState } from "./hooks";

export function UpdaterToast() {
  const state = useUpdaterState();
  const toastIdRef = useRef<string | null>(null);

  useEffect(() => {
    const close = () => {
      if (toastIdRef.current) {
        toastManager.close(toastIdRef.current);
        toastIdRef.current = null;
      }
    };

    const onClose = () => {
      toastIdRef.current = null;
    };

    if (state.status === "idle" || state.status === "checking") {
      close();
      return;
    }

    if (state.status === "up-to-date") {
      close();
      toastIdRef.current = toastManager.add({
        type: "success",
        title: "You're up to date",
        timeout: 10000,
        onClose,
      });
      return;
    }

    if (state.status === "error") {
      close();
      toastIdRef.current = toastManager.add({
        type: "error",
        title: state.message ?? "Update failed",
        timeout: 5000,
        onClose,
      });
      return;
    }

    if (state.status === "downloading") {
      if (toastIdRef.current) return;
      toastIdRef.current = toastManager.add({
        type: "loading",
        title: `Downloading update ${state.version}…`,
        timeout: 0,
        onClose,
      });
      return;
    }

    if (state.status === "ready") {
      const readyToast = {
        type: "success",
        title: `Update ${state.version} ready to install`,
        description: "Neovate will quit and reopen to finish updating.",
        actionProps: {
          children: "Restart",
          onClick: () => client.updater.install(),
        },
        timeout: 0,
        onClose,
      };
      if (toastIdRef.current) {
        toastManager.update(toastIdRef.current, readyToast);
      } else {
        toastIdRef.current = toastManager.add(readyToast);
      }
    }

    return close;
  }, [state]);

  return null;
}

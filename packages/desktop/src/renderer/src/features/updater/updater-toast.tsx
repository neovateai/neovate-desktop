import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { APP_NAME } from "../../../../shared/constants";
import { toastManager } from "../../components/ui/toast";
import { client } from "../../orpc";
import { useUpdaterState } from "./hooks";

type UpdaterErrorTitleKey =
  | "updater.installFailed"
  | "updater.checkTimedOut"
  | "updater.genericError";

function getErrorTitleKey(message: string | undefined): UpdaterErrorTitleKey {
  const normalized = message?.toLowerCase() ?? "";

  if (
    normalized.includes("bad file descriptor") ||
    normalized.includes("could not locate update bundle")
  ) {
    return "updater.installFailed";
  }

  if (normalized === "timeout") {
    return "updater.checkTimedOut";
  }

  return "updater.genericError";
}

export function UpdaterToast() {
  const { t } = useTranslation();
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
        title: t("updater.upToDate"),
        timeout: 10000,
        onClose,
      });
      return;
    }

    if (state.status === "error") {
      close();
      toastIdRef.current = toastManager.add({
        type: "error",
        title: t(getErrorTitleKey(state.message)),
        timeout: 5000,
        onClose,
      });
      return;
    }

    if (state.status === "downloading") {
      if (toastIdRef.current) return;
      toastIdRef.current = toastManager.add({
        type: "loading",
        title: t("updater.downloading", { version: state.version }),
        timeout: 0,
        onClose,
      });
      return;
    }

    if (state.status === "ready") {
      const readyToast = {
        type: "success",
        title: t("updater.readyToInstall", { version: state.version }),
        description: t("updater.readyDescription", { appName: APP_NAME }),
        actionProps: {
          children: t("updater.restart"),
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
  }, [state, t]);

  return null;
}

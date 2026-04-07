import { EditorEvent, IEditorTab } from "../../../../../shared/plugins/editor/contract";

export function handleEditorEvents(
  e: EditorEvent,
  opts?: {
    onTabsChange?: (tabs: IEditorTab[]) => void;
  },
) {
  const { type, detail } = e || {};
  const { onTabsChange } = opts || {};
  switch (type) {
    case "link.open":
      if (detail?.url) {
        window.open(detail?.url);
      }
      return;
    case "context.add":
      // add context [file]
      if (detail?.type === "file" && !!detail?.data?.relPath) {
        const filePath = detail.data.relPath;
        window.dispatchEvent(
          new CustomEvent("neovate:insert-chat", {
            detail: {
              mentions: [{ id: filePath, label: filePath }],
            },
          }),
        );
      }
      return;
    case "tabs.change":
      const { tabs = [] } = detail || {};
      onTabsChange?.(tabs);
      // TODO: 暂时无实际消费方，先保留此事件派发逻辑
      window.dispatchEvent(
        new CustomEvent("neovate:editor-tabs-change", {
          detail: { tabs },
        }),
      );
      return;
    default:
      return;
  }
}

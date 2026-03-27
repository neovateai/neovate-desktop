import { EditorEvent } from "../../../../shared/plugins/editor/contract";

export function handleEditorEvents(e: EditorEvent) {
  const { type, detail } = e || {};
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

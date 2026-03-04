import type { Editor } from "@tiptap/react";

/**
 * Position a suggestion popup above the input container, full width.
 * Walks up from the editor DOM to find the `.border-t` wrapper
 * (the MessageInput root div), then anchors the popup's bottom edge
 * to the wrapper's top edge.
 */
export function positionAboveInput(editor: Editor, container: HTMLDivElement) {
  let el: HTMLElement | null = editor.view.dom;
  while (el && !el.classList.contains("border-t")) {
    el = el.parentElement;
  }
  if (!el) return;

  const rect = el.getBoundingClientRect();
  container.style.left = `${rect.left}px`;
  container.style.bottom = `${window.innerHeight - rect.top}px`;
  container.style.width = `${rect.width}px`;
}

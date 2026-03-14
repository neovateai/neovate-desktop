import type { Editor } from "@tiptap/react";

/**
 * Position a suggestion popup above the input container, aligned with the editor.
 * Walks up from the editor DOM to find the `.tiptap` editor's parent container
 * (the rounded input box), then anchors the popup's bottom edge to its top edge.
 */
export function positionAboveInput(editor: Editor, container: HTMLDivElement) {
  // Find the editor element
  const editorEl = editor.view.dom;

  // Find the rounded input container (parent of tiptap editor with border)
  // It's the div with class containing "rounded-lg" or the tiptap wrapper
  let inputContainer: HTMLElement | null = editorEl;
  while (inputContainer && !inputContainer.classList.contains("tiptap")) {
    inputContainer = inputContainer.parentElement;
  }
  // Get the tiptap editor's parent (the actual input box with border)
  const targetEl = inputContainer?.parentElement;

  if (!targetEl) return;

  const rect = targetEl.getBoundingClientRect();
  const gap = 4; // small gap above the input
  container.style.left = `${rect.left}px`;
  container.style.bottom = `${window.innerHeight - rect.top + gap}px`;
  container.style.width = `${rect.width}px`;
}

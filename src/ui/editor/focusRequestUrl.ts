import { EditorView } from "@codemirror/view";

/** Focus and select the active HTTP/WebSocket URL without sending it. */
export function focusRequestUrl() {
  const content = document.querySelector<HTMLElement>("[data-request-url] .cm-content");
  const view = content && EditorView.findFromDOM(content);
  if (!view) return;
  view.focus();
  view.dispatch({ selection: { anchor: 0, head: view.state.doc.length }, scrollIntoView: true });
}

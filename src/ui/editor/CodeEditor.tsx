import { useEffect, useMemo, useState } from "react";
import CodeMirror, { EditorState, EditorView, keymap, Prec, type Extension } from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";

export type EditorLanguage = "json" | "xml" | "html" | "javascript" | "text" | "graphql";

const LANGS: Record<EditorLanguage, () => Extension[]> = {
  json: () => [json()],
  xml: () => [xml()],
  html: () => [html()],
  javascript: () => [javascript()],
  graphql: () => [],
  text: () => [],
};

export function usePrefersDark() {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return dark;
}

const baseTheme = EditorView.theme({
  "&": { fontSize: "12px", height: "100%", backgroundColor: "transparent" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
  ".cm-gutters": { backgroundColor: "transparent", borderRight: "1px solid var(--line)" },
  "&.cm-focused": { outline: "none" },
});

const singleLineTheme = EditorView.theme({
  ".cm-content": { padding: "5px 0" },
  ".cm-line": { padding: "0 8px" },
  ".cm-scroller": { overflow: "hidden" },
});

export interface CodeEditorProps {
  value: string;
  onChange?: (v: string) => void;
  language?: EditorLanguage;
  readOnly?: boolean;
  singleLine?: boolean;
  placeholder?: string;
  onEnter?: () => void;
  extensions?: Extension[];
  className?: string;
  lineWrapping?: boolean;
}

export function CodeEditor({ value, onChange, language = "text", readOnly, singleLine, placeholder, onEnter, extensions = [], className = "", lineWrapping }: CodeEditorProps) {
  const dark = usePrefersDark();
  const exts = useMemo(() => {
    const list: Extension[] = [baseTheme, ...LANGS[language](), ...extensions];
    if (singleLine) {
      list.push(
        singleLineTheme,
        // Collapse pasted newlines instead of rejecting the edit.
        EditorState.transactionFilter.of((tr) => {
          if (tr.newDoc.lines <= 1) return tr;
          const text = tr.newDoc.toString().replace(/\r?\n\s*/g, "");
          return tr.startState.update({ changes: { from: 0, to: tr.startState.doc.length, insert: text }, selection: { anchor: text.length } });
        }),
      );
      if (onEnter) list.push(Prec.highest(keymap.of([{ key: "Enter", run: () => (onEnter(), true) }])));
    }
    if (lineWrapping || singleLine) list.push(EditorView.lineWrapping);
    return list;
  }, [language, singleLine, onEnter, extensions, lineWrapping]);

  return (
    <CodeMirror
      className={className}
      value={value}
      onChange={onChange}
      theme={dark ? "dark" : "light"}
      height={singleLine ? undefined : "100%"}
      readOnly={readOnly}
      editable={!readOnly}
      placeholder={placeholder}
      extensions={exts}
      basicSetup={
        singleLine
          ? { lineNumbers: false, foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false, autocompletion: false, searchKeymap: false }
          : { highlightActiveLine: !readOnly, autocompletion: true }
      }
    />
  );
}

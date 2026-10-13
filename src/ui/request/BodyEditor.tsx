import { open } from "@tauri-apps/plugin-dialog";
import type { Body, BodyType, FormField, KeyValue, RawLanguage } from "../../core/model";
import { Button } from "../common/Button";
import { KeyValueCell, KeyValueTable } from "../common/KeyValueTable";
import type { Extension } from "@codemirror/state";
import { CodeEditor } from "../editor/CodeEditor";

const TYPES: { type: BodyType; label: string }[] = [
  { type: "none", label: "none" },
  { type: "form-data", label: "form-data" },
  { type: "urlencoded", label: "x-www-form-urlencoded" },
  { type: "raw", label: "raw" },
  { type: "binary", label: "binary" },
  { type: "graphql", label: "GraphQL" },
];

const LANGUAGES: { id: RawLanguage; label: string }[] = [
  { id: "json", label: "JSON" },
  { id: "text", label: "Text" },
  { id: "xml", label: "XML" },
  { id: "html", label: "HTML" },
];

/** Switching type keeps compatible content (e.g. fields between form types, text between raw and graphql). */
function convert(body: Body, type: BodyType): Body {
  const fields: KeyValue[] = body.type === "urlencoded" || body.type === "form-data" ? body.fields.map(({ key, value, enabled }) => ({ key, value, enabled })) : [];
  switch (type) {
    case "none":
      return { type };
    case "raw":
      return { type, language: "json", content: body.type === "graphql" ? body.query : "" };
    case "urlencoded":
      return { type, fields };
    case "form-data":
      return { type, fields: fields.map((f) => ({ ...f, kind: "text" as const })) };
    case "binary":
      return { type, filePath: "" };
    case "graphql":
      return { type, query: body.type === "raw" ? body.content : "", variables: "" };
  }
}

async function pickFile(): Promise<string | null> {
  const p = await open({ multiple: false, directory: false });
  return typeof p === "string" ? p : null;
}

export function beautify(content: string, language: RawLanguage): string {
  if (language !== "json") return content;
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

export function BodyEditor({ body, onChange, extensions }: { body: Body; onChange: (b: Body) => void; extensions?: Extension[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {TYPES.map((t) => (
          <label key={t.type} className="flex cursor-pointer items-center gap-1.5">
            <input type="radio" checked={body.type === t.type} onChange={() => body.type !== t.type && onChange(convert(body, t.type))} />
            {t.label}
          </label>
        ))}
        {body.type === "raw" && (
          <>
            <select
              className="rounded border border-line bg-elevated px-1.5 py-0.5"
              value={body.language}
              onChange={(e) => onChange({ ...body, language: e.target.value as RawLanguage })}
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            {body.language === "json" && (
              <button type="button" className="text-[12px] text-accent hover:underline" onClick={() => onChange({ ...body, content: beautify(body.content, "json") })}>
                Beautify
              </button>
            )}
          </>
        )}
      </div>

      {body.type === "none" && <p className="text-muted">This request does not have a body.</p>}

      {body.type === "raw" && (
        <div className="min-h-0 flex-1 rounded border border-line">
          <CodeEditor extensions={extensions} value={body.content} language={body.language} onChange={(content) => onChange({ ...body, content })} />
        </div>
      )}

      {body.type === "urlencoded" && (
        <KeyValueTable rows={body.fields} extensions={extensions} onChange={(fields) => onChange({ ...body, fields })} makeRow={(key, value, enabled) => ({ key, value, enabled })} />
      )}

      {body.type === "form-data" && (
        <KeyValueTable<FormField>
          rows={body.fields}
          extensions={extensions}
          onChange={(fields) => onChange({ ...body, fields })}
          makeRow={(key, value, enabled, prev) => ({ key, value, enabled, kind: prev?.kind ?? "text" })}
          extraHeader="Type"
          renderExtra={(row, update) => (
            <select className="h-7 w-full bg-transparent px-1 outline-none" value={row.kind} onChange={(e) => update({ kind: e.target.value as "text" | "file", value: "" })}>
              <option value="text">Text</option>
              <option value="file">File</option>
            </select>
          )}
          renderValue={(row, update) =>
            row.kind === "file" ? (
              <div className="flex h-7 items-center gap-2 px-2">
                <span className="mono min-w-0 flex-1 truncate" title={row.value}>
                  {row.value || <span className="text-muted">No file selected</span>}
                </span>
                <button type="button" className="text-accent hover:underline" onClick={async () => { const p = await pickFile(); if (p) update({ value: p }); }}>
                  Select
                </button>
              </div>
            ) : (
              <KeyValueCell value={row.value} extensions={extensions} onChange={(value) => update({ value })} />
            )
          }
        />
      )}

      {body.type === "binary" && (
        <div className="flex items-center gap-3">
          <Button onClick={async () => { const p = await pickFile(); if (p) onChange({ ...body, filePath: p }); }}>Select File</Button>
          <span className="mono truncate">{body.filePath || <span className="text-muted">No file selected</span>}</span>
        </div>
      )}

      {body.type === "graphql" && (
        <div className="grid min-h-0 flex-1 grid-cols-[3fr_2fr] gap-2">
          <div className="flex min-h-0 flex-col">
            <span className="mb-1 text-[12px] text-muted">Query</span>
            <div className="min-h-0 flex-1 rounded border border-line">
              <CodeEditor extensions={extensions} value={body.query} language="graphql" onChange={(query) => onChange({ ...body, query })} />
            </div>
          </div>
          <div className="flex min-h-0 flex-col">
            <span className="mb-1 text-[12px] text-muted">GraphQL Variables (JSON)</span>
            <div className="min-h-0 flex-1 rounded border border-line">
              <CodeEditor extensions={extensions} value={body.variables} language="json" onChange={(variables) => onChange({ ...body, variables })} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

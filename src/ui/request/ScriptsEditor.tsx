import { useState } from "react";
import type { Scripts } from "../../core/model";
import { CodeEditor } from "../editor/CodeEditor";
import { pmAutocomplete } from "../editor/pmCompletions";

const EXTENSIONS = [pmAutocomplete];

const HINTS = {
  pre: "Runs before the request is sent. Order: collection → folders → request.",
  post: "Runs after the response is received. Use pm.test() and pm.expect() for assertions.",
};

const SNIPPETS: Record<"pre" | "post", { label: string; code: string }[]> = {
  pre: [
    { label: "Set a variable", code: 'pm.variables.set("name", "value");' },
    { label: "Add a header", code: 'pm.request.headers.upsert({ key: "X-Request-Id", value: crypto.randomUUID() });' },
    { label: "Send a request", code: 'pm.sendRequest("https://example.com", (err, res) => {\n  console.log(res.code);\n});' },
  ],
  post: [
    { label: "Status is 200", code: 'pm.test("Status is 200", () => {\n  pm.response.to.have.status(200);\n});' },
    { label: "JSON value check", code: 'pm.test("Has id", () => {\n  pm.expect(pm.response.json().id).to.exist;\n});' },
    { label: "Save token to environment", code: 'pm.environment.set("token", pm.response.json().token);' },
  ],
};

export function ScriptsEditor({ scripts, onChange }: { scripts: Scripts; onChange: (s: Scripts) => void }) {
  const [phase, setPhase] = useState<"pre" | "post">("pre");
  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="flex w-40 shrink-0 flex-col gap-1">
        {(["pre", "post"] as const).map((p) => (
          <button
            key={p}
            type="button"
            className={`rounded px-2 py-1 text-left ${phase === p ? "bg-selected" : "text-muted hover:text-fg"}`}
            onClick={() => setPhase(p)}
          >
            {p === "pre" ? "Pre-request" : "Post-response"}
            {scripts[p].trim() && <span className="ml-1 text-[11px] text-ok">●</span>}
          </button>
        ))}
        <div className="mt-3 px-2 text-[11px] uppercase text-muted">Snippets</div>
        {SNIPPETS[phase].map((s) => (
          <button
            key={s.label}
            type="button"
            className="truncate rounded px-2 py-0.5 text-left text-[12px] text-accent hover:bg-hover"
            onClick={() => onChange({ ...scripts, [phase]: (scripts[phase].trimEnd() ? scripts[phase].trimEnd() + "\n\n" : "") + s.code + "\n" })}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <p className="mb-1 text-[12px] text-muted">{HINTS[phase]}</p>
        <div className="min-h-0 flex-1 rounded border border-line">
          <CodeEditor
            key={phase}
            language="javascript"
            extensions={EXTENSIONS}
            basicAutocomplete={false}
            value={scripts[phase]}
            onChange={(code) => onChange({ ...scripts, [phase]: code })}
          />
        </div>
      </div>
    </div>
  );
}

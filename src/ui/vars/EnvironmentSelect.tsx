import { useVariables } from "../../state/variables";
import { openVariablesDialog } from "./VariablesDialog";

export function EnvironmentSelect() {
  const { environments, activeEnvironmentId, setActiveEnvironment } = useVariables();
  return (
    <div className="flex items-center gap-1">
      <select
        className="max-w-52 rounded border border-line bg-elevated px-2 py-1"
        value={activeEnvironmentId ?? ""}
        onChange={(e) => void setActiveEnvironment(e.target.value || null)}
        title="Active environment"
      >
        <option value="">No Environment</option>
        {environments.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="rounded px-2 py-1 text-muted hover:bg-hover hover:text-fg"
        onClick={() => openVariablesDialog(activeEnvironmentId ? { kind: "env", id: activeEnvironmentId } : { kind: "globals" })}
      >
        Variables
      </button>
    </div>
  );
}

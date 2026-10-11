import { useState } from "react";
import type { Environment, Variable } from "../../core/model";
import { useVariables } from "../../state/variables";
import { Button } from "../common/Button";
import { askText, confirmDanger, Modal, openDialog } from "../common/dialogs";
import { showMenu } from "../common/ContextMenu";
import { VariableTable } from "./VariableTable";

type Selection = { kind: "globals" } | { kind: "env"; id: string };

function VariablesBody({ close, initial }: { close: () => void; initial: Selection }) {
  const store = useVariables();
  const [globals, setGlobals] = useState<Variable[]>(store.globals);
  const [envs, setEnvs] = useState<Environment[]>(store.environments);
  const [sel, setSel] = useState<Selection>(initial);
  const dirty = JSON.stringify(globals) !== JSON.stringify(store.globals) || JSON.stringify(envs) !== JSON.stringify(store.environments);

  const current = sel.kind === "env" ? envs.find((e) => e.id === sel.id) : undefined;
  const setEnv = (id: string, fn: (e: Environment) => Environment) => setEnvs(envs.map((e) => (e.id === id ? fn(e) : e)));

  const addEnv = async () => {
    const name = await askText("New environment", "Name", "Development");
    if (!name) return;
    const env: Environment = { id: crypto.randomUUID(), name, variables: [] };
    setEnvs([...envs, env]);
    setSel({ kind: "env", id: env.id });
  };

  const envMenu = (e: React.MouseEvent, env: Environment) =>
    showMenu(e, [
      {
        label: "Rename",
        onSelect: async () => {
          const name = await askText("Rename environment", "Name", env.name);
          if (name) setEnv(env.id, (x) => ({ ...x, name }));
        },
      },
      {
        label: "Duplicate",
        onSelect: () => setEnvs([...envs, { ...structuredClone(env), id: crypto.randomUUID(), name: `${env.name} copy` }]),
      },
      "separator",
      {
        label: "Delete",
        danger: true,
        onSelect: async () => {
          if (!(await confirmDanger("Delete environment", `Delete "${env.name}"?`))) return;
          setEnvs(envs.filter((x) => x.id !== env.id));
          setSel({ kind: "globals" });
        },
      },
    ]);

  const save = async () => {
    await store.saveGlobals(globals);
    await store.saveEnvironments(envs);
    close();
  };

  return (
    <Modal
      title="Variables"
      width={860}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!dirty} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex h-[55vh] gap-3">
        <div className="flex w-48 shrink-0 flex-col border-r border-line pr-2">
          <button type="button" className={`rounded px-2 py-1 text-left ${sel.kind === "globals" ? "bg-selected" : "hover:bg-hover"}`} onClick={() => setSel({ kind: "globals" })}>
            Globals
          </button>
          <div className="mb-1 mt-3 flex items-center justify-between px-2 text-[11px] uppercase text-muted">
            Environments
            <button type="button" className="text-accent" onClick={addEnv} title="Add environment">
              +
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {envs.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`block w-full truncate rounded px-2 py-1 text-left ${sel.kind === "env" && sel.id === e.id ? "bg-selected" : "hover:bg-hover"}`}
                onClick={() => setSel({ kind: "env", id: e.id })}
                onContextMenu={(ev) => envMenu(ev, e)}
              >
                {e.name}
                {e.id === store.activeEnvironmentId && <span className="ml-1 text-[11px] text-ok">active</span>}
              </button>
            ))}
            {envs.length === 0 && <p className="px-2 text-[12px] text-muted">No environments.</p>}
          </div>
        </div>
        <div className="min-w-0 flex-1 overflow-auto">
          {sel.kind === "globals" && (
            <>
              <h3 className="mb-2 font-semibold">Globals</h3>
              <VariableTable variables={globals} onChange={setGlobals} secretHint="Available in every collection. Stored in the app data folder." />
            </>
          )}
          {current && (
            <>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="font-semibold">{current.name}</h3>
                <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={(e) => envMenu(e, current)}>
                  •••
                </button>
              </div>
              <VariableTable
                variables={current.variables}
                onChange={(variables) => setEnv(current.id, (x) => ({ ...x, variables }))}
                secretHint="Environments are shared by all collections and stored in the app data folder."
              />
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function openVariablesDialog(initial: Selection = { kind: "globals" }) {
  return openDialog((close) => <VariablesBody close={close} initial={initial} />);
}

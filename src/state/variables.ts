import { create } from "zustand";
import { appDataApi } from "../ipc";
import type { Environment, Variable } from "../core/model";
import { storedVariable, variable } from "../core/yaml";

interface EnvironmentsDoc {
  activeId: string | null;
  items: Environment[];
}

interface VariablesState {
  globals: Variable[];
  environments: Environment[];
  activeEnvironmentId: string | null;
  load(): Promise<void>;
  saveGlobals(globals: Variable[]): Promise<void>;
  saveEnvironments(environments: Environment[]): Promise<void>;
  setActiveEnvironment(id: string | null): Promise<void>;
  activeEnvironment(): Environment | undefined;
}

const normalizeEnv = (e: Partial<Environment>): Environment => ({
  id: e.id ?? crypto.randomUUID(),
  name: e.name ?? "Environment",
  variables: (e.variables ?? []).map(variable),
});

export const useVariables = create<VariablesState>((set, get) => {
  const persistEnvironments = () =>
    appDataApi.write("environments", {
      activeId: get().activeEnvironmentId,
      items: get().environments.map((e) => ({ ...e, variables: e.variables.map(storedVariable) })),
    });

  return {
    globals: [],
    environments: [],
    activeEnvironmentId: null,
    async load() {
      const [globals, envs] = await Promise.all([
        appDataApi.read<Variable[]>("globals"),
        appDataApi.read<Partial<EnvironmentsDoc>>("environments"),
      ]);
      const environments = (envs?.items ?? []).map(normalizeEnv);
      const activeId = environments.some((e) => e.id === envs?.activeId) ? envs!.activeId! : null;
      set({ globals: (globals ?? []).map(variable), environments, activeEnvironmentId: activeId });
    },
    async saveGlobals(globals) {
      set({ globals });
      await appDataApi.write("globals", globals.map(storedVariable));
    },
    async saveEnvironments(environments) {
      const active = get().activeEnvironmentId;
      set({ environments, activeEnvironmentId: environments.some((e) => e.id === active) ? active : null });
      await persistEnvironments();
    },
    async setActiveEnvironment(id) {
      set({ activeEnvironmentId: id });
      await persistEnvironments();
    },
    activeEnvironment() {
      return get().environments.find((e) => e.id === get().activeEnvironmentId);
    },
  };
});

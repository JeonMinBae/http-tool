import { useMemo } from "react";
import { buildScopes, secretNames } from "../../core/variables";
import { samePath } from "../../core/path";
import { useVariables } from "../../state/variables";
import { useWorkspace } from "../../state/workspace";
import { useVarHighlight } from "./varHighlight";

/** Current variable scopes for a collection root (reactive). */
export function useScopes(root: string | null) {
  const globals = useVariables((s) => s.globals);
  const env = useVariables((s) => s.environments.find((e) => e.id === s.activeEnvironmentId));
  const collection = useWorkspace((s) => (root ? s.collections.find((c) => samePath(c.root, root))?.doc.variables : undefined));
  return useMemo(() => {
    const scopes = buildScopes({ globals, environment: env?.variables, collection });
    const secrets = new Set(secretNames([...globals, ...(env?.variables ?? []), ...(collection ?? [])]));
    return { scopes, secrets };
  }, [globals, env, collection]);
}

export function useVarExtension(root: string | null) {
  const { scopes, secrets } = useScopes(root);
  return useVarHighlight(scopes, secrets);
}

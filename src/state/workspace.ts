import { create } from "zustand";
import { appDataApi, fsApi, type AppDataApi } from "../ipc";
import { CollectionRepo, type LoadedCollection } from "../core/collectionRepo";
import type { CollectionDoc } from "../core/model";
import { isInside, samePath } from "../core/path";
import { applySecrets, extractSecrets, secretsName, type SecretValues } from "../core/secrets";

interface WorkspaceDoc {
  openCollections: string[];
}

export interface WorkspaceState {
  collections: LoadedCollection[];
  /** Paths that could not be reopened on the last restore. */
  missing: string[];
  restore(): Promise<void>;
  openCollection(path: string): Promise<LoadedCollection>;
  closeCollection(root: string): Promise<void>;
  reload(root: string): Promise<void>;
  saveCollectionDoc(root: string, doc: CollectionDoc): Promise<void>;
  collectionOf(path: string): LoadedCollection | undefined;
}

export function createWorkspaceStore(repo: CollectionRepo, appData: AppDataApi) {
  return create<WorkspaceState>((set, get) => {
    const persist = () =>
      appData.write("workspace", { openCollections: get().collections.map((c) => c.root) } satisfies WorkspaceDoc);

    async function loadWithSecrets(root: string): Promise<LoadedCollection> {
      const col = await repo.load(root);
      const secrets = (await appData.read<SecretValues>(await secretsName(col.root))) ?? {};
      return { ...col, doc: { ...col.doc, variables: applySecrets(col.doc.variables, secrets) } };
    }

    const replace = (col: LoadedCollection) =>
      set({ collections: get().collections.map((c) => (samePath(c.root, col.root) ? col : c)) });

    return {
      collections: [],
      missing: [],
      async restore() {
        const doc = await appData.read<WorkspaceDoc>("workspace");
        const collections: LoadedCollection[] = [];
        const missing: string[] = [];
        for (const path of doc?.openCollections ?? []) {
          try {
            const root = await repo.register(path);
            collections.push(await loadWithSecrets(root));
          } catch {
            missing.push(path);
          }
        }
        set({ collections, missing });
        if (missing.length) await persist();
      },
      async openCollection(path) {
        const root = await repo.register(path);
        const existing = get().collections.find((c) => samePath(c.root, root));
        if (existing) return existing;
        const col = await loadWithSecrets(root);
        set({ collections: [...get().collections, col] });
        await persist();
        return col;
      },
      async closeCollection(root) {
        set({ collections: get().collections.filter((c) => !samePath(c.root, root)) });
        await repo.unregister(root);
        await persist();
      },
      async reload(root) {
        replace(await loadWithSecrets(root));
      },
      async saveCollectionDoc(root, doc) {
        await repo.saveCollection(root, doc);
        await appData.write(await secretsName(root), extractSecrets(doc.variables));
        const col = get().collections.find((c) => samePath(c.root, root));
        if (col) replace({ ...col, doc });
      },
      collectionOf(path) {
        return get().collections.find((c) => samePath(c.root, path) || isInside(path, c.root));
      },
    };
  });
}

export const collectionRepo = new CollectionRepo(fsApi);
export const useWorkspace = createWorkspaceStore(collectionRepo, appDataApi);

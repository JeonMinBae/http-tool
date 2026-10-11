import { useState } from "react";
import type { CollectionDoc, FolderDoc } from "../../core/model";
import { useTabs, type Tab } from "../../state/tabs";
import { saveTab } from "../actions";
import { Button } from "../common/Button";
import { Icon } from "../common/icons";
import { SectionTabs } from "../request/RequestEditor";
import { AuthEditor } from "../request/AuthEditor";
import { VariableTable } from "../vars/VariableTable";

type Section = "variables" | "auth";

/** Settings editor for a collection (variables + auth) or a folder (auth). */
export function ContainerSettings({ tab }: { tab: Tab<CollectionDoc | FolderDoc> }) {
  const isCollection = tab.draft.kind === "collection";
  const [section, setSection] = useState<Section>(isCollection ? "variables" : "auth");
  const update = useTabs((s) => s.update);
  const d = tab.draft;
  const patch = (p: { variables?: CollectionDoc["variables"]; auth?: CollectionDoc["auth"] }) =>
    update<CollectionDoc | FolderDoc>(tab.id, (x) => ({ ...x, ...p }) as CollectionDoc | FolderDoc);

  const sections: { id: Section; label: string }[] = isCollection
    ? [
        { id: "variables", label: "Variables" },
        { id: "auth", label: "Auth" },
      ]
    : [{ id: "auth", label: "Auth" }];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Icon name={isCollection ? "collection" : "folder"} className="text-muted" />
        <span className="font-semibold">{d.name}</span>
        <span className="text-muted">{isCollection ? "Collection settings" : "Folder settings"}</span>
        <div className="flex-1" />
        <Button onClick={() => void saveTab(tab.id)}>Save</Button>
      </div>
      <SectionTabs<Section> sections={sections} active={section} onSelect={setSection} />
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {section === "variables" && d.kind === "collection" && (
          <VariableTable
            variables={d.variables}
            onChange={(variables) => patch({ variables })}
            secretHint="Saved in collection.yaml. Secret values are kept in the app data folder, not in the collection."
          />
        )}
        {section === "auth" && <AuthEditor auth={d.auth} allowInherit={!isCollection} onChange={(auth) => patch({ auth })} />}
      </div>
    </div>
  );
}

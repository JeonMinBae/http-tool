import { Button } from "./Button";
import { Modal, openDialog } from "./dialogs";

export function openShortcutsHelp(isMac: boolean) {
  const mod = isMac ? "⌘" : "Ctrl+";
  const shortcuts = [
    [`${mod}L`, "Focus URL (HTTP / WebSocket)"],
    [`${mod}Shift+T`, "Reopen last closed tab"],
    [`${mod}/`, "Keyboard shortcuts"],
    [`${mod}N`, "New request"],
    [`${mod}S`, "Save current tab"],
    [`${mod}W`, "Close current tab"],
    [`${mod}Enter`, "Send request"],
    ["Enter in URL", "Send request / connect WebSocket"],
    [`${mod}K`, "Search sidebar"],
    [`${mod}D in sidebar`, "Duplicate focused request / folder"],
    ["F2 in sidebar", "Rename focused request / folder"],
    [`F5 / ${mod}R`, "Refresh collection files"],
    [`${mod}1–8 / ${mod}9`, "Select tab / last tab"],
    ["Ctrl+Tab / Ctrl+Shift+Tab", "Next / previous tab"],
    ...(isMac ? [["⌘Shift+] / ⌘Shift+[", "Next / previous tab"]] : []),
    [`${mod},`, "Settings"],
    [`${mod}Shift+B`, "Cycle response body view"],
    ["Tab / Shift+Tab", "Next / previous control in single-line fields"],
    ["Escape", "Close dialog or menu"],
  ];
  return openDialog((close) => (
    <Modal title="Keyboard shortcuts" width={620} onClose={close} footer={<Button autoFocus onClick={close}>Close</Button>}>
      <p className="mb-3 text-[12px] text-muted">Sidebar shortcuts require a focused item. Global navigation shortcuts are disabled while a dialog is open.</p>
      <table className="w-full text-left text-[12px]">
        <thead><tr className="text-muted"><th className="pb-2 font-normal">Shortcut</th><th className="pb-2 font-normal">Action</th></tr></thead>
        <tbody>{shortcuts.map(([key, action]) => (
          <tr key={key} className="border-t border-line"><td className="py-1.5 pr-5"><kbd className="mono">{key}</kbd></td><td className="py-1.5">{action}</td></tr>
        ))}</tbody>
      </table>
    </Modal>
  ));
}

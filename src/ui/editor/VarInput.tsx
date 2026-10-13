import { createContext, useContext } from "react";
import { CodeEditor } from "./CodeEditor";
import { useVarExtension } from "./useScopes";

/** Collection root whose variables `VarInput`s below resolve against. */
export const VarRootContext = createContext<string | null>(null);

/** Single-line input with {{variable}} highlight, hover and completion. */
export function VarInput({ value, onChange, placeholder, className = "", readOnly }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; readOnly?: boolean }) {
  const ext = useVarExtension(useContext(VarRootContext));
  return <CodeEditor singleLine className={className} extensions={ext} value={value} placeholder={placeholder} readOnly={readOnly} onChange={onChange} />;
}

import type { Body } from "../core/model";
import type { VarScopes } from "../core/variables";

export interface ScriptRequest {
  name: string;
  method: string;
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  body: Body;
}

export interface ScriptResponse {
  code: number;
  status: string;
  headers: [string, string][];
  /** UTF-8 decoded body ("" for binary responses). */
  body: string;
  responseTime: number;
  size: number;
}

export interface ScriptInput {
  phase: "pre" | "post";
  code: string;
  scopes: VarScopes;
  request: ScriptRequest;
  response?: ScriptResponse;
  /** False when no environment is active; environment writes are then dropped with a warning. */
  hasEnvironment: boolean;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface LogEntry {
  level: "log" | "info" | "warn" | "error";
  args: string[];
}

export interface ScriptOutput {
  scopes: VarScopes;
  request: ScriptRequest;
  tests: TestResult[];
  logs: LogEntry[];
  error?: string;
}

/** Request made from a script with pm.sendRequest (resolved by the host). */
export interface ScriptSendRequest {
  method: string;
  url: string;
  headers: [string, string][];
  body?: string;
}

export type WorkerMessage =
  | { type: "done"; output: ScriptOutput }
  | { type: "sendRequest"; id: number; request: ScriptSendRequest };

export type HostMessage =
  | { type: "run"; input: ScriptInput }
  | { type: "sendResult"; id: number; response?: ScriptResponse; error?: string };

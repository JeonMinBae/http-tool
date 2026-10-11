import type { HttpMethod } from "../../core/model";

const COLORS: Record<HttpMethod, string> = {
  GET: "text-[#16a34a] dark:text-[#4ade80]",
  POST: "text-[#c27c0e] dark:text-[#f0b33a]",
  PUT: "text-[#2563eb] dark:text-[#60a5fa]",
  PATCH: "text-[#9333ea] dark:text-[#c084fc]",
  DELETE: "text-[#d93a3a] dark:text-[#f06262]",
  HEAD: "text-muted",
  OPTIONS: "text-muted",
};

export const methodColor = (m: HttpMethod) => COLORS[m];

export const methodLabel = (m: HttpMethod) => (m === "DELETE" ? "DEL" : m === "OPTIONS" ? "OPT" : m);

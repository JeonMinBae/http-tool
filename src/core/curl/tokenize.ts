/** Splits a pasted curl command into arguments, honouring bash, Windows cmd and PowerShell quoting. */

export type ShellStyle = "bash" | "cmd" | "powershell";

export function detectStyle(text: string): ShellStyle {
  if (/\^"/.test(text) || /\s\^\r?\n/.test(text)) return "cmd";
  if (/^\s*curl\.exe\b/i.test(text) || /`\r?\n/.test(text)) return "powershell";
  return "bash";
}

function tokenizeBash(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let has = false;
  let i = 0;
  const push = () => {
    if (has) out.push(cur);
    cur = "";
    has = false;
  };
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      const n = text[i + 1];
      if (n === "\n") i += 2;
      else if (n === "\r" && text[i + 2] === "\n") i += 3;
      else {
        cur += n ?? "";
        has = true;
        i += 2;
      }
    } else if (c === "'") {
      const end = text.indexOf("'", i + 1);
      cur += text.slice(i + 1, end < 0 ? undefined : end);
      has = true;
      i = end < 0 ? text.length : end + 1;
    } else if (c === "$" && text[i + 1] === "'") {
      i += 2;
      while (i < text.length && text[i] !== "'") {
        if (text[i] === "\\") {
          const n = text[i + 1];
          cur += ({ n: "\n", t: "\t", r: "\r", "\\": "\\", "'": "'", '"': '"' } as Record<string, string>)[n] ?? `\\${n}`;
          i += 2;
        } else cur += text[i++];
      }
      has = true;
      i++;
    } else if (c === '"') {
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\" && '$`"\\\n'.includes(text[i + 1])) {
          if (text[i + 1] !== "\n") cur += text[i + 1];
          i += 2;
        } else cur += text[i++];
      }
      has = true;
      i++;
    } else if (/\s/.test(c)) {
      push();
      i++;
    } else {
      cur += c;
      has = true;
      i++;
    }
  }
  push();
  return out;
}

function tokenizeCmd(text: string): string[] {
  // Undo cmd caret escaping: "^\n\n" is a literal newline, "^\n" a continuation, "^x" a literal x.
  const unescaped = text.replace(/\^\r?\n\r?\n/g, "\u0000").replace(/\^\r?\n/g, " ").replace(/\^(.)/g, "$1").replace(/\u0000/g, "\n");
  const out: string[] = [];
  let cur = "";
  let has = false;
  let quoted = false;
  let i = 0;
  while (i < unescaped.length) {
    const c = unescaped[i];
    if (c === "\\") {
      let n = 0;
      while (unescaped[i] === "\\") {
        n++;
        i++;
      }
      if (unescaped[i] === '"') {
        cur += "\\".repeat(Math.floor(n / 2));
        if (n % 2 === 1) {
          cur += '"';
          i++;
        }
      } else cur += "\\".repeat(n);
      has = true;
    } else if (c === '"') {
      quoted = !quoted;
      has = true;
      i++;
    } else if (!quoted && /\s/.test(c)) {
      if (has) out.push(cur);
      cur = "";
      has = false;
      i++;
    } else {
      cur += c;
      has = true;
      i++;
    }
  }
  if (has) out.push(cur);
  return out;
}

function tokenizePowerShell(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let has = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "`") {
      const n = text[i + 1];
      if (n === "\n") i += 2;
      else if (n === "\r" && text[i + 2] === "\n") i += 3;
      else {
        cur += n ?? "";
        has = true;
        i += 2;
      }
    } else if (c === "'") {
      i++;
      while (i < text.length) {
        if (text[i] === "'" && text[i + 1] === "'") {
          cur += "'";
          i += 2;
        } else if (text[i] === "'") break;
        else cur += text[i++];
      }
      has = true;
      i++;
    } else if (c === '"') {
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "`") {
          const n = text[i + 1];
          cur += ({ n: "\n", t: "\t", r: "\r" } as Record<string, string>)[n] ?? n;
          i += 2;
        } else cur += text[i++];
      }
      has = true;
      i++;
    } else if (/\s/.test(c)) {
      if (has) out.push(cur);
      cur = "";
      has = false;
      i++;
    } else {
      cur += c;
      has = true;
      i++;
    }
  }
  if (has) out.push(cur);
  return out;
}

export function tokenize(text: string): string[] {
  const style = detectStyle(text);
  return style === "cmd" ? tokenizeCmd(text) : style === "powershell" ? tokenizePowerShell(text) : tokenizeBash(text);
}

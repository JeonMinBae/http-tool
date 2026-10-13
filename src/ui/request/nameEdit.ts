/** The name to commit after editing the name field, or null when nothing should change (blank or unchanged). */
export function nextName(prev: string, input: string): string | null {
  const name = input.trim();
  return name && name !== prev ? name : null;
}

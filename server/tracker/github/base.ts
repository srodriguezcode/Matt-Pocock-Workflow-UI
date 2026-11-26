/** The branch named by a System body's `Base:` line, with or without backticks. */
export function baseLine(body: string): string | null {
  return /^Base:\s*`?([^`\s]+)`?/m.exec(body)?.[1] ?? null;
}

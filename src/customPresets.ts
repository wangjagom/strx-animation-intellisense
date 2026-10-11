/** Finds preset names registered with `definePreset("name", ...)` in source text. */
export function findDefinedPresets(text: string): string[] {
  const names: string[] = [];
  const pattern = /\bdefinePreset\s*\(\s*(["'`])([a-z][a-z0-9-]*)\1/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    names.push(match[2]);
  }

  return names;
}

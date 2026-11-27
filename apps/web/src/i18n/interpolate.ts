export type MessageParams = Readonly<Record<string, string | number>>;

/** Replaces `{name}` placeholders; a placeholder without a value stays as written. */
export function interpolate(template: string, params: MessageParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
  });
}

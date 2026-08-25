const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isId(value: string): boolean {
  return ID_RE.test(value);
}

export function slugId(prefix: string, raw: string): string {
  const slug = raw
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const body = slug.length > 0 ? slug : "item";
  const id = `${prefix}-${body}-${Date.now().toString(36)}`;
  if (!isId(id)) {
    throw new Error("generated identifier is invalid");
  }
  return id;
}

export function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "item";
}

/** Appends -2, -3, ... until `taken(candidate)` returns false. */
export async function uniqueSlug(
  base: string,
  taken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  let n = 2;
  while (await taken(candidate)) {
    candidate = `${root}-${n}`;
    n += 1;
  }
  return candidate;
}

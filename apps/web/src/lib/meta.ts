export type Meta = {
  title: string;
  description: string;
  path: string;
};

export function buildMeta(meta: Meta) {
  const base = "https://zbestmedia.com";
  const url = `${base}${meta.path}`;
  return { ...meta, url };
}

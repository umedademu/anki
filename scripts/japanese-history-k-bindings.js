const maxPartBytes = 4000;
const maxParts = 60;

// Cloudflareの一変数の上限内で、日本語も欠けずに登録設定を渡す。
export function encodeJsonBindings(name, value) {
  const encoder = new TextEncoder(), parts = [];
  let part = "", bytes = 0;
  for (const character of JSON.stringify(value)) {
    const size = encoder.encode(character).length;
    if (bytes + size > maxPartBytes) { parts.push(part); part = ""; bytes = 0; }
    part += character; bytes += size;
  }
  parts.push(part);
  if (parts.length > maxParts) throw new Error("登録設定が分割数の上限を超えています。");
  return { [`${name}_PARTS`]: String(parts.length), ...Object.fromEntries(parts.map((text, index) => [`${name}_${index}`, text])) };
}

export function readJsonBinding(env, name, fallback) {
  const rawCount = env[`${name}_PARTS`];
  if (rawCount === undefined) {
    if (Object.keys(env).some(key => key.startsWith(`${name}_`))) throw new Error("登録設定の分割数が欠落しています。");
    return JSON.parse(env[name] ?? fallback);
  }
  const count = Number(rawCount);
  if (!Number.isInteger(count) || count < 1 || count > maxParts) throw new Error("登録設定の分割数が不正です。");
  const parts = Array.from({ length: count }, (_, index) => {
    const part = env[`${name}_${index}`];
    if (typeof part !== "string") throw new Error("登録設定の一部が欠落しています。");
    return part;
  });
  return JSON.parse(parts.join(""));
}

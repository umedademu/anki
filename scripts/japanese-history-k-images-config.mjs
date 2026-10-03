// 画像が増えても、作業用の設定をCloudflareの一設定あたりの上限内で渡す。
export function imageWriterVars(settings) {
  const vars = {}, encoder = new TextEncoder();
  for (const [name, value] of Object.entries(settings)) {
    const parts = []; let part = "", size = 0;
    for (const character of JSON.stringify(value)) {
      const bytes = encoder.encode(character).byteLength;
      if (size + bytes > 4000) { parts.push(part); part = ""; size = 0; }
      part += character; size += bytes;
    }
    parts.push(part); vars[name + "_PARTS"] = String(parts.length);
    parts.forEach((text, index) => { vars[name + "_" + index] = text; });
  }
  return vars;
}

export function readImageWriterSetting(env, name, fallback) {
  if (env[name + "_PARTS"] === undefined) return JSON.parse(env[name] ?? JSON.stringify(fallback));
  const count = Number(env[name + "_PARTS"]);
  if (!Number.isInteger(count) || count < 1 || count > 1000) throw Error("Invalid configuration");
  let text = "";
  for (let index = 0; index < count; index++) {
    const part = env[name + "_" + index];
    if (typeof part !== "string" || new TextEncoder().encode(part).byteLength > 4000) throw Error("Invalid configuration");
    text += part;
  }
  return JSON.parse(text);
}

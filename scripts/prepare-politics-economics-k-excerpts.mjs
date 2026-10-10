import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildPoliticsKExcerpt, politicsKExcerptPath } from "./politics-economics-k.mjs";

// 手元の原文全体から、各原稿の小見出しの範囲を抜粋として書き出す。
const root = path.resolve(import.meta.dirname, ".."), directory = path.join(root, "data/source/politics-economics-k");
for (const name of (await readdir(directory)).filter(value => /^\d{2}-\d{2}\.json$/.test(value)).sort()) {
  const bank = JSON.parse(await readFile(path.join(directory, name), "utf8")), target = path.join(root, politicsKExcerptPath(bank));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buildPoliticsKExcerpt(await readFile(path.join(root, bank.source.file), "utf8"), bank));
  console.log(`${name} → ${politicsKExcerptPath(bank)}`);
}

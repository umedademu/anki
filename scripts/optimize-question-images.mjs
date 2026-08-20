import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourceDirectory = path.join(projectRoot, "data", "source", "world-history");
const imageDirectory = path.join(sourceDirectory, "term-images");
const optimizedDirectory = path.join(imageDirectory, "optimized");
const manifestPath = path.join(sourceDirectory, "term-images.json");

function assertInsideImageDirectory(targetPath) {
  const relative = path.relative(imageDirectory, path.resolve(targetPath));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`画像フォルダー外の操作を拒否しました: ${targetPath}`);
  }
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 2) {
    throw new Error("問題別画像一覧が作成されていません。");
  }
  await mkdir(optimizedDirectory, { recursive: true });
  const replacements = [];
  let optimizedCount = 0;
  for (const asset of manifest.assets) {
    if (!asset.id.startsWith("WM-")) continue;
    const sourcePath = path.join(sourceDirectory, asset.path);
    const finalPath = path.join(optimizedDirectory, `${asset.id}.webp`);
    const temporaryPath = `${finalPath}.tmp`;
    assertInsideImageDirectory(sourcePath);
    assertInsideImageDirectory(finalPath);
    assertInsideImageDirectory(temporaryPath);
    try {
      await stat(finalPath);
    } catch {
      await sharp(sourcePath, { animated: false })
        .rotate()
        .resize({
          width: 720,
          height: 540,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 78, alphaQuality: 82, effort: 5 })
        .toFile(temporaryPath);
      await rename(temporaryPath, finalPath);
    }
    replacements.push({ sourcePath, finalPath });
    asset.path = `term-images/optimized/${asset.id}.webp`;
    optimizedCount += 1;
    if (optimizedCount % 50 === 0) {
      console.log(`画像圧縮: ${optimizedCount}点`);
    }
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  for (const { sourcePath, finalPath } of replacements) {
    if (path.resolve(sourcePath) !== path.resolve(finalPath)) {
      await rm(sourcePath, { force: true });
    }
  }
  const referencedPaths = new Set(
    manifest.assets.map((asset) => path.resolve(sourceDirectory, asset.path)),
  );
  for (const entry of await readdir(imageDirectory, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !entry.name.startsWith("WM-")) continue;
    const candidatePath = path.resolve(entry.parentPath, entry.name);
    assertInsideImageDirectory(candidatePath);
    if (!referencedPaths.has(candidatePath)) {
      await rm(candidatePath, { force: true });
    }
  }
  console.log(`画像圧縮完了: ${optimizedCount}点`);
}

await main();

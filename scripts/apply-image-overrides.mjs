import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assetIdForSource,
  commonsMetadata,
  downloadAsset,
  findImage,
  imageAssetIdPrefix,
  imageSubjectId,
} from "./prepare-question-images.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourceDirectory = path.join(projectRoot, "data", "source", imageSubjectId);
const manifestPath = path.join(sourceDirectory, "term-images.json");
const overridePath = path.join(sourceDirectory, "image-overrides.json");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const overrides = JSON.parse(await readFile(overridePath, "utf8"));
const assetsBySource = new Map(
  manifest.assets.map((asset) => [asset.sourcePageUrl, asset]),
);
const fallbackByTerm = new Map(
  manifest.termFallbacks.map((fallback) => [fallback.termId, fallback]),
);

for (const override of overrides) {
  const fallback = fallbackByTerm.get(override.termId);
  if (!fallback) throw new Error(`存在しない用語IDです: ${override.termId}`);
  const replacementAssignment = override.useQuestionTargetOf
    ? manifest.assignments.find(
        (assignment) =>
          assignment.termId === override.useQuestionTargetOf.termId &&
          assignment.target === override.useQuestionTargetOf.target,
      )
    : null;
  const replacementFallback = override.useTermFallbackOf
    ? fallbackByTerm.get(override.useTermFallbackOf)
    : null;
  const replacementAssetId =
    replacementAssignment?.assetId ?? replacementFallback?.assetId;
  if (override.useQuestionTargetOf && !replacementAssignment) {
    throw new Error(
      `参照する問題別画像がありません: ${override.useQuestionTargetOf.termId} ${override.useQuestionTargetOf.target}`,
    );
  }
  if (override.useTermFallbackOf && !replacementFallback) {
    throw new Error(`参照する標準画像がありません: ${override.useTermFallbackOf}`);
  }
  if (replacementAssetId) {
    if (override.target) {
      const targetAssignments = manifest.assignments.filter(
        (assignment) =>
          assignment.termId === override.termId && assignment.target === override.target,
      );
      if (targetAssignments.length === 0) {
        throw new Error(`問題別画像の対象がありません: ${override.termId} ${override.target}`);
      }
      for (const assignment of targetAssignments) {
        assignment.assetId = replacementAssetId;
      }
    } else {
      const previousAssetId = fallback.assetId;
      fallback.assetId = replacementAssetId;
      for (const assignment of manifest.assignments) {
        if (
          assignment.termId === override.termId &&
          assignment.assetId === previousAssetId
        ) {
          assignment.assetId = replacementAssetId;
        }
      }
    }
    continue;
  }
  if (override.useFallback) {
    if (!override.target) {
      throw new Error(`標準画像へ戻す問題別対象がありません: ${override.termId}`);
    }
    const targetAssignments = manifest.assignments.filter(
      (assignment) =>
        assignment.termId === override.termId && assignment.target === override.target,
    );
    if (targetAssignments.length === 0) {
      throw new Error(`問題別画像の対象がありません: ${override.termId} ${override.target}`);
    }
    for (const assignment of targetAssignments) assignment.assetId = fallback.assetId;
    continue;
  }
  const metadata = override.fileName
    ? await commonsMetadata(override.fileName)
    : await findImage(
        override.query,
        override.context ?? "日本史",
        undefined,
      );
  if (!metadata) {
    throw new Error(
      `指定画像を確認できません: ${override.fileName ?? override.query}`,
    );
  }
  if (!override.caption) {
    throw new Error(`画像の説明がありません: ${override.termId}`);
  }
  let asset = assetsBySource.get(metadata.sourcePageUrl);
  if (!asset) {
    const id = assetIdForSource(metadata.sourcePageUrl, imageAssetIdPrefix);
    asset = {
      id,
      path: await downloadAsset(metadata, id),
      alt: override.caption,
      caption: override.caption,
      creator: metadata.creator,
      license: metadata.license,
      licenseUrl: metadata.licenseUrl,
      sourcePageUrl: metadata.sourcePageUrl,
    };
    manifest.assets.push(asset);
    assetsBySource.set(asset.sourcePageUrl, asset);
  }
  if (override.target) {
    const targetAssignments = manifest.assignments.filter(
      (assignment) =>
        assignment.termId === override.termId && assignment.target === override.target,
    );
    if (targetAssignments.length === 0) {
      throw new Error(`問題別画像の対象がありません: ${override.termId} ${override.target}`);
    }
    for (const assignment of targetAssignments) assignment.assetId = asset.id;
  } else {
    const previousAssetId = fallback.assetId;
    fallback.assetId = asset.id;
    for (const assignment of manifest.assignments) {
      if (assignment.termId === override.termId && assignment.assetId === previousAssetId) {
        assignment.assetId = asset.id;
      }
    }
  }
}

const referencedAssetIds = new Set([
  ...manifest.termFallbacks.map((fallback) => fallback.assetId),
  ...manifest.assignments.map((assignment) => assignment.assetId),
]);
manifest.assets = [
  ...new Map(manifest.assets.map((asset) => [asset.id, asset])).values(),
]
  .filter((asset) => referencedAssetIds.has(asset.id))
  .sort((left, right) => left.id.localeCompare(right.id));
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`${overrides.length}用語の画像を個別指定へ置き換えました。`);

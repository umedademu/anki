const defaultSettings = {
  againSeconds: 60,
  hardSeconds: 4 * 60 * 60,
  goodSeconds: 12 * 60 * 60,
  easySeconds: 6 * 24 * 60 * 60,
};

const ratingValues = new Set(["again", "hard", "good", "easy"]);

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
  if (origin && origin === env.ALLOWED_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Allow-Methods"] = "GET, PUT, POST, DELETE, OPTIONS";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

function json(request, env, payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders(request, env),
  });
}

async function isAuthorized(request, env) {
  const authorization = request.headers.get("Authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!supplied || !env.SYNC_TOKEN) {
    return false;
  }
  const encoder = new TextEncoder();
  const [suppliedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
    crypto.subtle.digest("SHA-256", encoder.encode(env.SYNC_TOKEN)),
  ]);
  const left = new Uint8Array(suppliedHash);
  const right = new Uint8Array(expectedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function integer(value, fallback, minimum = 0, maximum = 1_000_000_000) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function optionalDate(value) {
  if (value == null || value === "") {
    return null;
  }
  const text = String(value);
  if (!Number.isFinite(Date.parse(text))) {
    throw new Error("日時の形式が正しくありません。");
  }
  return new Date(text).toISOString();
}

function normalizeQuestionRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("学習記録の形式が正しくありません。");
  }
  const lastRating = value.lastRating == null ? null : String(value.lastRating);
  if (lastRating && !ratingValues.has(lastRating)) {
    throw new Error("評価の値が正しくありません。");
  }
  return {
    streak: integer(value.streak, 0),
    attempts: integer(value.attempts, 0),
    rememberedCount: integer(value.rememberedCount, 0),
    lastRating,
    lastAnsweredAt: optionalDate(value.lastAnsweredAt),
    nextReviewAt: optionalDate(value.nextReviewAt),
    everMastered: Boolean(value.everMastered),
  };
}

function normalizeSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    Object.entries(defaultSettings).map(([key, fallback]) => [
      key,
      integer(source[key], fallback, 1, 365 * 24 * 60 * 60),
    ]),
  );
}

function normalizeDatasetVersion(value) {
  const datasetVersion = String(value ?? "");
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(datasetVersion)) {
    throw new Error("問題集の版が正しくありません。");
  }
  return datasetVersion;
}

function progressStatement(env, datasetVersion, questionId, record, updatedAt) {
  return env.DB.prepare(
    `INSERT INTO question_progress (
      dataset_version, question_id, streak, attempts, remembered_count, last_rating,
      last_answered_at, next_review_at, ever_mastered, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(dataset_version, question_id) DO UPDATE SET
      streak = excluded.streak,
      attempts = excluded.attempts,
      remembered_count = excluded.remembered_count,
      last_rating = excluded.last_rating,
      last_answered_at = excluded.last_answered_at,
      next_review_at = excluded.next_review_at,
      ever_mastered = excluded.ever_mastered,
      updated_at = excluded.updated_at`,
  ).bind(
    datasetVersion,
    questionId,
    record.streak,
    record.attempts,
    record.rememberedCount,
    record.lastRating,
    record.lastAnsweredAt,
    record.nextReviewAt,
    record.everMastered ? 1 : 0,
    updatedAt,
  );
}

async function readState(env, datasetVersion) {
  const [progressRows, settingsRow] = await Promise.all([
    env.DB.prepare(
      `SELECT question_id, streak, attempts, remembered_count, last_rating,
        last_answered_at, next_review_at, ever_mastered, updated_at
       FROM question_progress WHERE dataset_version = ?`,
    ).bind(datasetVersion).all(),
    env.DB.prepare(
      `SELECT again_seconds, hard_seconds, good_seconds, easy_seconds, updated_at
       FROM review_settings WHERE profile_id = 1`,
    ).first(),
  ]);
  let newestUpdate = null;
  const questions = Object.fromEntries(
    (progressRows.results ?? []).map((row) => {
      if (!newestUpdate || row.updated_at > newestUpdate) {
        newestUpdate = row.updated_at;
      }
      return [
        row.question_id,
        {
          streak: row.streak,
          attempts: row.attempts,
          rememberedCount: row.remembered_count,
          lastRating: row.last_rating,
          lastAnsweredAt: row.last_answered_at,
          nextReviewAt: row.next_review_at,
          everMastered: Boolean(row.ever_mastered),
        },
      ];
    }),
  );
  return {
    progress: { questions, updatedAt: newestUpdate },
    settings: settingsRow
      ? {
          againSeconds: settingsRow.again_seconds,
          hardSeconds: settingsRow.hard_seconds,
          goodSeconds: settingsRow.good_seconds,
          easySeconds: settingsRow.easy_seconds,
          updatedAt: settingsRow.updated_at,
        }
      : defaultSettings,
  };
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return request.headers.get("Origin") === env.ALLOWED_ORIGIN
      ? new Response(null, { status: 204, headers: corsHeaders(request, env) })
      : json(request, env, { error: "許可されていない接続元です。" }, 403);
  }
  if (url.pathname === "/health" && request.method === "GET") {
    return json(request, env, { ok: true });
  }
  if (!(await isAuthorized(request, env))) {
    return json(request, env, { error: "認証に失敗しました。" }, 401);
  }

  if (url.pathname === "/v1/state" && request.method === "GET") {
    const datasetVersion = url.searchParams.get("dataset");
    return json(
      request,
      env,
      datasetVersion
        ? await readState(env, normalizeDatasetVersion(datasetVersion))
        : { progress: { questions: {}, updatedAt: null }, settings: (await readState(env, "__settings_only__")).settings },
    );
  }

  const questionMatch = url.pathname.match(/^\/v1\/progress\/([^/]+)$/);
  if (questionMatch) {
    const questionId = decodeURIComponent(questionMatch[1]);
    const datasetVersion = normalizeDatasetVersion(url.searchParams.get("dataset"));
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(questionId)) {
      return json(request, env, { error: "問題番号が正しくありません。" }, 400);
    }
    if (request.method === "PUT") {
      const record = normalizeQuestionRecord(await request.json());
      const updatedAt = new Date().toISOString();
      await progressStatement(env, datasetVersion, questionId, record, updatedAt).run();
      return json(request, env, { ok: true, updatedAt });
    }
    if (request.method === "DELETE") {
      await env.DB.prepare(
        "DELETE FROM question_progress WHERE dataset_version = ? AND question_id = ?",
      )
        .bind(datasetVersion, questionId)
        .run();
      return json(request, env, { ok: true });
    }
  }

  if (url.pathname === "/v1/progress/import" && request.method === "POST") {
    const body = await request.json();
    const datasetVersion = normalizeDatasetVersion(body.datasetVersion);
    const entries = Object.entries(body.questions ?? {});
    if (entries.length === 0 || entries.length > 40) {
      return json(request, env, { error: "一度に取り込める記録は1〜40問です。" }, 400);
    }
    const updatedAt = new Date().toISOString();
    await env.DB.batch(
      entries.map(([questionId, value]) => {
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(questionId)) {
          throw new Error("問題番号が正しくありません。");
        }
        return progressStatement(
          env,
          datasetVersion,
          questionId,
          normalizeQuestionRecord(value),
          updatedAt,
        );
      }),
    );
    return json(request, env, { ok: true, imported: entries.length, updatedAt });
  }

  if (url.pathname === "/v1/progress" && request.method === "DELETE") {
    const datasetVersion = normalizeDatasetVersion(url.searchParams.get("dataset"));
    await env.DB.prepare("DELETE FROM question_progress WHERE dataset_version = ?")
      .bind(datasetVersion)
      .run();
    return json(request, env, { ok: true });
  }

  if (url.pathname === "/v1/settings" && request.method === "PUT") {
    const settings = normalizeSettings(await request.json());
    const updatedAt = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO review_settings (
        profile_id, again_seconds, hard_seconds, good_seconds, easy_seconds, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(profile_id) DO UPDATE SET
        again_seconds = excluded.again_seconds,
        hard_seconds = excluded.hard_seconds,
        good_seconds = excluded.good_seconds,
        easy_seconds = excluded.easy_seconds,
        updated_at = excluded.updated_at`,
    )
      .bind(
        settings.againSeconds,
        settings.hardSeconds,
        settings.goodSeconds,
        settings.easySeconds,
        updatedAt,
      )
      .run();
    return json(request, env, { ok: true, settings: { ...settings, updatedAt } });
  }

  return json(request, env, { error: "該当する処理がありません。" }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      return json(request, env, { error: error.message || "処理に失敗しました。" }, 400);
    }
  },
};

export { normalizeDatasetVersion, normalizeQuestionRecord, normalizeSettings };

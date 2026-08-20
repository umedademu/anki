const cloudflareDataBaseUrl =
  "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev";
const usesLocalData = ["localhost", "127.0.0.1"].includes(
  window.location.hostname,
);
const cloudflareProgressApiUrl =
  "https://anki-progress-api.umedademu.workers.dev";

window.ANKI_CONFIG = {
  dataBaseUrl: usesLocalData ? "/data" : cloudflareDataBaseUrl,
  progressApiBaseUrl: usesLocalData
    ? "http://localhost:8787"
    : cloudflareProgressApiUrl,
  subjectId: "world-history",
};

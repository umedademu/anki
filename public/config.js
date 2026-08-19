const cloudflareDataBaseUrl =
  "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev";
const usesLocalData = ["localhost", "127.0.0.1"].includes(
  window.location.hostname,
);

window.ANKI_CONFIG = {
  dataBaseUrl: usesLocalData ? "/data" : cloudflareDataBaseUrl,
  subjectId: "world-history",
};

// 設定欄の値が変わるたびに保存する。入力中は少し待ってまとめ、保存中に変わった値は終わってから保存し直す。
// 保存に成功した内容と同じ内容は送り直さない。
export function createAutoSave({ read, save, delay = 400 }) {
  let timer = 0;
  let running = null;
  let queued = false;
  let lastSaved;

  function run() {
    clearTimeout(timer);
    timer = 0;
    if (running) {
      queued = true;
      return running;
    }
    const value = JSON.stringify(read());
    if (value === lastSaved) return Promise.resolve(null);
    running = (async () => {
      try {
        await save();
        lastSaved = value;
      } catch {
        // 失敗の表示は save 側で行い、次の変更で再度保存を試みる。
      } finally {
        running = null;
        if (queued) {
          queued = false;
          void run();
        }
      }
    })();
    return running;
  }

  return {
    now: () => run(),
    later() {
      clearTimeout(timer);
      timer = setTimeout(() => void run(), delay);
    },
    get pending() {
      return timer !== 0 || queued;
    },
  };
}

export function createAudioOutput({
  AudioContextClass =
    globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null,
} = {}) {
  let context = null;

  function getContext() {
    if (context?.state === "closed") {
      context = null;
    }
    if (!context && typeof AudioContextClass === "function") {
      context = new AudioContextClass({ latencyHint: "interactive" });
    }
    return context;
  }

  async function resume() {
    const current = getContext();
    if (
      current &&
      ["suspended", "interrupted"].includes(current.state) &&
      typeof current.resume === "function"
    ) {
      await current.resume();
    }
    return current;
  }

  async function decode(audioData) {
    const current = getContext();
    if (!current || typeof current.decodeAudioData !== "function") {
      throw new Error("この端末では音声を読み込めません。");
    }
    const source = audioData instanceof ArrayBuffer
      ? audioData
      : ArrayBuffer.isView(audioData)
        ? audioData.buffer.slice(
            audioData.byteOffset,
            audioData.byteOffset + audioData.byteLength,
          )
        : typeof audioData?.arrayBuffer === "function"
          ? await audioData.arrayBuffer()
          : null;
    if (!source?.byteLength) {
      throw new Error("音声の内容が空です。");
    }
    return current.decodeAudioData(source.slice(0));
  }

  function close() {
    const current = context;
    context = null;
    if (!current || current.state === "closed") {
      return Promise.resolve();
    }
    try {
      return Promise.resolve(current.close?.()).catch(() => {});
    } catch {
      return Promise.resolve();
    }
  }

  return { getContext, resume, decode, close };
}

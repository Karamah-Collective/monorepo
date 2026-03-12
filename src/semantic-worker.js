/**
 * Semantic Search Web Worker
 *
 * Runs Transformers.js (ONNX Runtime Web) in a background thread so the
 * main UI never blocks.  On first search the quantized all-MiniLM-L6-v2
 * model (~12 MB gzipped) is fetched from the HuggingFace CDN and cached
 * automatically by the library in IndexedDB — subsequent visits load
 * from cache in <100 ms.
 *
 * Messages IN:
 *   { type: "warmup" }            – preload model (call early, e.g. on focus)
 *   { type: "embed",  id, query } – embed a query string; returns vector
 *
 * Messages OUT:
 *   { type: "ready" }                          – model loaded & warm
 *   { type: "result", id, vector: Float32Array } – query embedding
 *   { type: "error",  id?, message }           – something went wrong
 */

/* global self */

let pipelineInstance = null;
let loading = false;

async function getPipeline() {
  if (pipelineInstance) return pipelineInstance;
  if (loading) {
    // Another call is already loading — wait for it
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (pipelineInstance) { clearInterval(check); resolve(pipelineInstance); }
      }, 100);
    });
  }
  loading = true;
  try {
    // Transformers.js v3 from CDN
    const { pipeline } = await import(
      /* webpackIgnore: true */
      "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1"
    );
    pipelineInstance = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      { dtype: "q8" },
    );
    return pipelineInstance;
  } catch (err) {
    loading = false;
    throw err;
  }
}

self.onmessage = async (e) => {
  const { type, id, query } = e.data;

  if (type === "warmup") {
    try {
      await getPipeline();
      self.postMessage({ type: "ready" });
    } catch (err) {
      self.postMessage({ type: "error", message: err.message });
    }
    return;
  }

  if (type === "embed") {
    try {
      const pipe = await getPipeline();
      const output = await pipe(query, { pooling: "mean", normalize: true });
      // output.data is a Float32Array of shape [1, 384]
      self.postMessage({ type: "result", id, vector: Array.from(output.data) });
    } catch (err) {
      self.postMessage({ type: "error", id, message: err.message });
    }
  }
};

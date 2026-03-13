// No-op sharp stub — skill-router only uses text embeddings.
// Exports a callable so @huggingface/transformers' `if (sharp)` check passes
// and its `loadImageFunction` is defined (even though we never call it).
function sharp() {
  throw new Error("sharp stub: image processing is not available");
}
export default sharp;

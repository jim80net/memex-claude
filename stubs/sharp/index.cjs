// No-op sharp stub — skill-router only uses text embeddings.
// Exports a callable so @huggingface/transformers' `if (sharp)` check passes.
function sharp() {
  throw new Error("sharp stub: image processing is not available");
}
module.exports = sharp;
module.exports.default = sharp;

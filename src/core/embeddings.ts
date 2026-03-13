import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2";

// Store model files alongside existing cache
env.cacheDir = join(homedir(), ".claude", "cache", "models");

// Singleton pipeline — created once per process
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
let currentModel = "";

function getExtractor(model: string): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise || currentModel !== model) {
    currentModel = model;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extractorPromise = (pipeline as any)("feature-extraction", model, {
      dtype: "q8",
    }) as Promise<FeatureExtractionPipeline>;
  }
  return extractorPromise;
}

export async function embedTexts(
  texts: string[],
  opts: { model?: string } = {}
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const model = opts.model || DEFAULT_MODEL;
  const extractor = await getExtractor(model);

  const output = await extractor(texts, { pooling: "mean", normalize: true });

  // output is a Tensor with shape [batch_size, hidden_dim]
  const data = output.data as Float32Array;
  const dims = output.dims as number[];
  const dim = dims[dims.length - 1];
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    results.push(Array.from(data.slice(i * dim, (i + 1) * dim)));
  }

  return results;
}

/**
 * Cosine similarity between two vectors.
 * Our embeddings are pre-normalized (normalize: true in embedTexts), so this
 * is effectively a dot product. We keep the full formula for correctness with
 * any externally-supplied vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }

  // Fast path: normalized vectors (norm ≈ 1.0) — just return dot product.
  // For non-normalized inputs, compute the full formula.
  let normSqA = 0;
  let normSqB = 0;
  for (let i = 0; i < a.length; i++) {
    normSqA += a[i] * a[i];
    normSqB += b[i] * b[i];
  }

  // If both vectors are unit-length (within floating-point tolerance), return dot directly
  if (Math.abs(normSqA - 1.0) < 1e-6 && Math.abs(normSqB - 1.0) < 1e-6) {
    return dot;
  }

  const denom = Math.sqrt(normSqA) * Math.sqrt(normSqB);
  if (denom === 0) return 0;
  return dot / denom;
}

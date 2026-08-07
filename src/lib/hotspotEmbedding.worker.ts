import { pipeline, type FeatureExtractionPipeline, type ProgressInfo } from "@huggingface/transformers";
import {
  EMBEDDING_MODEL_ID,
  HOTSPOT_CATEGORY_PROTOTYPES,
  SCORED_DISPLAY_CATEGORY_KEYS
} from "./hotspotCategoryPrototypes";
import { averageVectors, normalizeVector, pickCategoryFromScores, rankCategoryScores } from "./hotspotEmbeddingMath";
import type { HotspotDisplayCategoryKey } from "../types";

type WorkerRequest =
  | { id: number; type: "classify"; texts: string[] }
  | { id: number; type: "warmup" };

type WorkerResponse =
  | { id: number; type: "ready" }
  | { id: number; type: "result"; categories: HotspotDisplayCategoryKey[] }
  | { id: number; type: "error"; message: string }
  | { type: "progress"; data: ProgressInfo };

let extractor: FeatureExtractionPipeline | null = null;
let centroids: Record<(typeof SCORED_DISPLAY_CATEGORY_KEYS)[number], number[]> | null = null;
let prepareCentroidsPromise: Promise<void> | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    extractor = await pipeline("feature-extraction", EMBEDDING_MODEL_ID, {
      progress_callback: (data) => {
        const message: WorkerResponse = { type: "progress", data };
        self.postMessage(message);
      }
    });
  }
  return extractor;
}

async function embedText(text: string): Promise<number[]> {
  const pipe = await getExtractor();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (const text of texts) {
    vectors.push(await embedText(text));
  }
  return vectors;
}

async function ensureCentroids(): Promise<Record<(typeof SCORED_DISPLAY_CATEGORY_KEYS)[number], number[]>> {
  if (centroids) {
    return centroids;
  }
  if (!prepareCentroidsPromise) {
    prepareCentroidsPromise = (async () => {
      const next: Partial<Record<(typeof SCORED_DISPLAY_CATEGORY_KEYS)[number], number[]>> = {};
      for (const key of SCORED_DISPLAY_CATEGORY_KEYS) {
        const vectors = await embedTexts(HOTSPOT_CATEGORY_PROTOTYPES[key]);
        next[key] = normalizeVector(averageVectors(vectors));
      }
      centroids = next as Record<(typeof SCORED_DISPLAY_CATEGORY_KEYS)[number], number[]>;
    })();
  }
  await prepareCentroidsPromise;
  return centroids!;
}

async function classifyTexts(texts: string[]): Promise<HotspotDisplayCategoryKey[]> {
  const categoryCentroids = await ensureCentroids();
  const vectors = await embedTexts(texts);
  return vectors.map((vector) => pickCategoryFromScores(rankCategoryScores(vector, categoryCentroids)));
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void (async () => {
    const request = event.data;
    try {
      if (request.type === "warmup") {
        await ensureCentroids();
        const response: WorkerResponse = { id: request.id, type: "ready" };
        self.postMessage(response);
        return;
      }

      const categories = await classifyTexts(request.texts);
      const response: WorkerResponse = { id: request.id, type: "result", categories };
      self.postMessage(response);
    } catch (error) {
      const response: WorkerResponse = {
        id: request.id,
        type: "error",
        message: error instanceof Error ? error.message : String(error)
      };
      self.postMessage(response);
    }
  })();
};

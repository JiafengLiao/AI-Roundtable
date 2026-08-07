import type { HotspotDisplayCategoryKey } from "../types";
import {
  EMBEDDING_MIN_MARGIN,
  EMBEDDING_MIN_SCORE,
  SCORED_DISPLAY_CATEGORY_KEYS
} from "./hotspotCategoryPrototypes";

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function averageVectors(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    return [];
  }
  const size = vectors[0].length;
  const sum = new Array<number>(size).fill(0);
  vectors.forEach((vector) => {
    vector.forEach((value, index) => {
      sum[index] += value;
    });
  });
  return sum.map((value) => value / vectors.length);
}

export function normalizeVector(vector: number[]): number[] {
  let norm = 0;
  for (const value of vector) {
    norm += value * value;
  }
  norm = Math.sqrt(norm);
  if (norm === 0) {
    return vector.slice();
  }
  return vector.map((value) => value / norm);
}

export type CategoryScore = {
  key: HotspotDisplayCategoryKey;
  score: number;
};

export function rankCategoryScores(
  vector: number[],
  centroids: Record<(typeof SCORED_DISPLAY_CATEGORY_KEYS)[number], number[]>
): CategoryScore[] {
  return SCORED_DISPLAY_CATEGORY_KEYS.map((key) => ({
    key,
    score: cosineSimilarity(vector, centroids[key])
  })).sort((left, right) => right.score - left.score);
}

export function pickCategoryFromScores(ranked: CategoryScore[]): HotspotDisplayCategoryKey {
  const [best, second] = ranked;
  if (!best || best.score < EMBEDDING_MIN_SCORE) {
    return "other";
  }
  if (second && best.score - second.score < EMBEDDING_MIN_MARGIN) {
    return "other";
  }
  return best.key;
}

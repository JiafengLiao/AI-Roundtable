import type { HotspotCandidate } from "../types";
import type { HotspotDisplayCategoryKey } from "../types";
import { inferHotspotDisplayCategory } from "./hotspotClassification";

type WorkerRequest =
  | { id: number; type: "classify"; texts: string[] }
  | { id: number; type: "warmup" };

type WorkerResponse =
  | { id: number; type: "ready" }
  | { id: number; type: "result"; categories: HotspotDisplayCategoryKey[] }
  | { id: number; type: "error"; message: string }
  | { type: "progress"; data: unknown };

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, { resolve: (value: HotspotDisplayCategoryKey[]) => void; reject: (error: Error) => void }>();

export function hotspotEmbeddingText(hotspot: HotspotCandidate): string {
  const publisher = hotspot.sources[0]?.publisher;
  return [hotspot.title, hotspot.summary, publisher].filter(Boolean).join(". ");
}

export function hotspotContentKey(hotspot: HotspotCandidate): string {
  return `${hotspot.title}|${hotspot.summary}`;
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./hotspotEmbedding.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === "progress") {
        return;
      }
      const entry = pending.get(message.id);
      if (!entry) {
        return;
      }
      pending.delete(message.id);
      if (message.type === "error") {
        entry.reject(new Error(message.message));
        return;
      }
      if (message.type === "result") {
        entry.resolve(message.categories);
        return;
      }
      if (message.type === "ready") {
        entry.resolve([]);
      }
    };
    worker.onerror = (error) => {
      pending.forEach(({ reject }) => reject(new Error(error.message || "Embedding worker failed")));
      pending.clear();
    };
  }
  return worker;
}

function runWorkerClassify(texts: string[]): Promise<HotspotDisplayCategoryKey[]> {
  if (texts.length === 0) {
    return Promise.resolve([]);
  }
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, type: "classify", texts } satisfies WorkerRequest);
  });
}

export async function warmupHotspotEmbeddingClassifier(): Promise<void> {
  const id = nextRequestId++;
  await new Promise<void>((resolve, reject) => {
    pending.set(id, {
      resolve: () => resolve(),
      reject
    });
    getWorker().postMessage({ id, type: "warmup" } satisfies WorkerRequest);
  });
}

export async function classifyHotspotTexts(texts: string[]): Promise<HotspotDisplayCategoryKey[]> {
  try {
    return await runWorkerClassify(texts);
  } catch (error) {
    console.warn("Embedding classification failed, falling back to rules", error);
    return texts.map(() => "other" as HotspotDisplayCategoryKey);
  }
}

export async function classifyHotspotDisplayCategories(
  hotspots: HotspotCandidate[]
): Promise<HotspotCandidate[]> {
  if (hotspots.length === 0) {
    return hotspots;
  }

  const texts = hotspots.map(hotspotEmbeddingText);
  let categories: HotspotDisplayCategoryKey[];
  try {
    categories = await classifyHotspotTexts(texts);
  } catch (error) {
    console.warn("Embedding batch classification failed", error);
    categories = hotspots.map(() => "other");
  }

  return hotspots.map((hotspot, index) => {
    const embedded = categories[index] ?? "other";
    const displayCategory = embedded === "other" ? inferHotspotDisplayCategory(hotspot) : embedded;
    return { ...hotspot, displayCategory };
  });
}

export function mergePreservedDisplayCategories(
  fetched: HotspotCandidate[],
  previous: HotspotCandidate[]
): HotspotCandidate[] {
  const previousById = new Map(previous.map((hotspot) => [hotspot.id, hotspot]));
  return fetched.map((hotspot) => {
    const prev = previousById.get(hotspot.id);
    if (
      prev?.displayCategory &&
      hotspotContentKey(prev) === hotspotContentKey(hotspot)
    ) {
      return { ...hotspot, displayCategory: prev.displayCategory };
    }
    return hotspot;
  });
}

export async function finalizeHotspotCategories(
  fetched: HotspotCandidate[],
  previous: HotspotCandidate[] = []
): Promise<HotspotCandidate[]> {
  const merged = mergePreservedDisplayCategories(fetched, previous);
  const needsClassification = merged.filter((hotspot) => !hotspot.displayCategory);
  if (needsClassification.length === 0) {
    return merged;
  }
  const classified = await classifyHotspotDisplayCategories(needsClassification);
  const classifiedById = new Map(classified.map((hotspot) => [hotspot.id, hotspot]));
  return merged.map((hotspot) => classifiedById.get(hotspot.id) ?? hotspot);
}

export function disposeHotspotEmbeddingClassifier() {
  worker?.terminate();
  worker = null;
  pending.clear();
}

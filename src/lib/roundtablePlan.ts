import type { HotspotCandidate, RoundtablePlan } from "../types";

export type PlanTopicDisplay = {
  title: string;
  summary: string;
};

const MAX_TOPIC_SUMMARY_LENGTH = 300;

function limitTopicSummary(value: string) {
  const normalized = value.trim();
  if (normalized.length <= MAX_TOPIC_SUMMARY_LENGTH) return normalized;
  return normalized.slice(0, MAX_TOPIC_SUMMARY_LENGTH);
}

export function getPlanTopicDisplay(
  plan: RoundtablePlan | null,
  hotspot: HotspotCandidate | null,
  fallbackTitle = "Agent 工具链进入生产化拐点",
  fallbackSummary = "让 AI 从业者在 8 分钟内判断这个热点对产品路线、工程投入和投资叙事的影响。"
): PlanTopicDisplay {
  if (!plan) {
    return {
      title: fallbackTitle,
    summary: limitTopicSummary(fallbackSummary)
    };
  }

  return {
    title: plan.topicTitle?.trim() || fallbackTitle,
    summary: limitTopicSummary(plan.topicSummary?.trim() || fallbackSummary)
  };
}

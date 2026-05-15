import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { analyzeWithGemini } from "@/lib/gemini-analyze";
import {
  buildFewShotBlock,
  buildRagSystemPrompt,
  buildRagUserPrompt,
  buildReferenceContext,
  retrieveStandardClauses,
} from "@/lib/rag";

const InputSchema = z.object({
  contractType: z.string().min(1).max(100),
  text: z.string().min(50).max(120_000),
});

const AnalysisSchema = z.object({
  overallScore: z.number().min(0).max(100),
  summary: z.string(),
  riskCounts: z.object({
    high: z.number(),
    mid: z.number(),
    safe: z.number(),
  }),
  clauses: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      level: z.enum(["high", "mid", "safe"]),
      original: z.string(),
      plain: z.string(),
      issue: z.string(),
      suggestion: z.string(),
      basis: z.string(),
    }),
  ),
});

export type AnalysisResult = z.infer<typeof AnalysisSchema>;

const BASE_SYSTEM_PROMPT = `당신은 한국의 표준약관 및 공정거래 관련 법령(공정거래위원회 표준약관, 약관규제법, 저작권법, 하도급법, 상가건물임대차보호법 등)에 정통한 계약 검토 전문가입니다.

사용자가 제공한 계약서 본문을 분석하여 프리랜서/소상공인에게 불리한 '독소 조항'을 찾아내고, 안전한 대안 문구를 제시합니다.

분석 원칙:
1. 위험(high): 법적 효력이 의심되거나 일방적으로 매우 불리한 조항 (예: 지식재산권 무상 전부 귀속, 무제한 손해배상, 일방 해지권, 부당한 비밀유지 의무).
2. 주의(mid): 모호한 표현, 분쟁 소지, 표준약관 대비 불리한 조항 (예: '필요시 수정', 무제한 수정 요구, 대금 지급 시기 모호).
3. 안전(safe): 표준약관에 부합하는 조항 (보고용으로 1-2개만 포함).

각 조항에 대해:
- original: 계약서에서 그대로 발췌한 원문 (1-3문장)
- plain: 어려운 법률용어/한자어를 일상어로 풀어쓴 설명
- issue: 왜 문제인지 구체적으로 설명
- suggestion: 즉시 사용 가능한 대안 문구 (계약서에 그대로 넣을 수 있는 완성형 문장)
- basis: [REF-N] 인용 또는 검색 조항에 근거한 표준약관·법령 근거

최소 4개, 최대 12개의 의미있는 조항을 반환하세요. overallScore는 0(매우 위험)~100(매우 안전).
말투는 친절하고 명확하게, 사용자를 안심시키되 위험은 분명하게 알리세요.`;

function getGeminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || null;
}

async function analyzeViaLovable(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
): Promise<AnalysisResult> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "submit_analysis",
            description: "계약서 분석 결과를 제출합니다.",
            parameters: {
              type: "object",
              properties: {
                overallScore: { type: "number" },
                summary: { type: "string" },
                riskCounts: {
                  type: "object",
                  properties: {
                    high: { type: "number" },
                    mid: { type: "number" },
                    safe: { type: "number" },
                  },
                  required: ["high", "mid", "safe"],
                },
                clauses: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
                      level: { type: "string", enum: ["high", "mid", "safe"] },
                      original: { type: "string" },
                      plain: { type: "string" },
                      issue: { type: "string" },
                      suggestion: { type: "string" },
                      basis: { type: "string" },
                    },
                    required: [
                      "id",
                      "title",
                      "level",
                      "original",
                      "plain",
                      "issue",
                      "suggestion",
                      "basis",
                    ],
                  },
                },
              },
              required: ["overallScore", "summary", "riskCounts", "clauses"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "submit_analysis" } },
    }),
  });

  if (res.status === 429) {
    throw new Error("요청이 많아 잠시 후 다시 시도해주세요.");
  }
  if (res.status === 402) {
    throw new Error("AI 사용량이 소진되었습니다. 워크스페이스 크레딧을 확인해주세요.");
  }
  if (!res.ok) {
    const t = await res.text();
    console.error("AI gateway error", res.status, t);
    throw new Error("AI 분석 중 오류가 발생했습니다.");
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
  };
  const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error("AI 응답을 해석할 수 없습니다.");
  }

  return AnalysisSchema.parse(JSON.parse(toolCall.function.arguments));
}

export const analyzeContract = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const geminiKey = getGeminiApiKey();
    const lovableKey = process.env.LOVABLE_API_KEY?.trim();

    if (!geminiKey && !lovableKey) {
      throw new Error("GEMINI_API_KEY 또는 LOVABLE_API_KEY가 설정되지 않았습니다.");
    }

    // RAG: Vectorize 검색 → D1 원문 → Context-Injection + Few-shot
    let retrieved: Awaited<ReturnType<typeof retrieveStandardClauses>> = [];
    if (geminiKey) {
      try {
        retrieved = await retrieveStandardClauses(data.contractType, data.text, geminiKey);
        console.info(`[RAG] 검색된 표준 조항: ${retrieved.length}건`);
      } catch (e) {
        console.warn("[RAG] 검색 실패 — 기본 프롬프트로 진행", e);
      }
    }

    const referenceContext = buildReferenceContext(retrieved);
    const fewShotBlock = buildFewShotBlock(retrieved);
    const systemPrompt = buildRagSystemPrompt(BASE_SYSTEM_PROMPT, referenceContext, fewShotBlock);
    const userPrompt = buildRagUserPrompt(data.contractType, data.text);

    let parsed: AnalysisResult;
    if (geminiKey) {
      const raw = await analyzeWithGemini(geminiKey, systemPrompt, userPrompt);
      parsed = AnalysisSchema.parse(raw);
    } else {
      parsed = await analyzeViaLovable(systemPrompt, userPrompt, lovableKey!);
    }

    return parsed;
  });

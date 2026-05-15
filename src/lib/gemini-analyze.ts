const MODEL = "gemini-2.5-pro";

const FUNCTION_DECLARATION = {
  name: "submit_analysis",
  description: "계약서 분석 결과를 제출합니다.",
  parameters: {
    type: "OBJECT",
    properties: {
      overallScore: { type: "NUMBER" },
      summary: { type: "STRING" },
      riskCounts: {
        type: "OBJECT",
        properties: {
          high: { type: "NUMBER" },
          mid: { type: "NUMBER" },
          safe: { type: "NUMBER" },
        },
        required: ["high", "mid", "safe"],
      },
      clauses: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            id: { type: "STRING" },
            title: { type: "STRING" },
            level: { type: "STRING", enum: ["high", "mid", "safe"] },
            original: { type: "STRING" },
            plain: { type: "STRING" },
            issue: { type: "STRING" },
            suggestion: { type: "STRING" },
            basis: { type: "STRING" },
          },
          required: ["id", "title", "level", "original", "plain", "issue", "suggestion", "basis"],
        },
      },
    },
    required: ["overallScore", "summary", "riskCounts", "clauses"],
  },
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        functionCall?: { name?: string; args?: Record<string, unknown> };
      }>;
    };
  }>;
};

export async function analyzeWithGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<Record<string, unknown>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      tools: [{ functionDeclarations: [FUNCTION_DECLARATION] }],
      toolConfig: {
        functionCallingConfig: {
          mode: "ANY",
          allowedFunctionNames: ["submit_analysis"],
        },
      },
    }),
  });

  if (res.status === 429) {
    throw new Error("요청이 많아 잠시 후 다시 시도해주세요.");
  }
  if (!res.ok) {
    const t = await res.text();
    console.error("Gemini analyze error", res.status, t);
    throw new Error("AI 분석 중 오류가 발생했습니다.");
  }

  const json = (await res.json()) as GeminiResponse;
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.functionCall?.name === "submit_analysis");
  const args = part?.functionCall?.args;
  if (!args) {
    throw new Error("AI 응답을 해석할 수 없습니다.");
  }

  return args;
}

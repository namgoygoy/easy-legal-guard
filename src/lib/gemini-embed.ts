const EMBEDDING_MODEL = "gemini-embedding-2";
const OUTPUT_DIMENSIONALITY = 768;

type EmbedResponse = {
  embedding?: { values?: number[] };
};

export async function embedQueryText(text: string, apiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: OUTPUT_DIMENSIONALITY,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`임베딩 API 오류 (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as EmbedResponse;
  const values = json.embedding?.values;
  if (!values?.length) {
    throw new Error("임베딩 응답이 비어 있습니다.");
  }
  if (values.length !== OUTPUT_DIMENSIONALITY) {
    throw new Error(`임베딩 차원 불일치: ${values.length} (예상 ${OUTPUT_DIMENSIONALITY})`);
  }
  return values;
}

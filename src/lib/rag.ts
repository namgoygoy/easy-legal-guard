import { embedQueryText } from "@/lib/gemini-embed";
import { resolveServiceTypeId } from "@/lib/contract-types";

export type StandardClause = {
  id: string;
  contract_type: string;
  main_category: string | null;
  sub_category: string | null;
  detail_category: string | null;
  article_no: number | null;
  labels: string;
  content: string;
  service_type_id: string;
  service_type_label: string | null;
  document_name: string | null;
  source_zip: string | null;
  source_file: string | null;
  split: string | null;
};

export type RetrievedClause = StandardClause & {
  score: number;
  refId: string;
};

const RISK_HIGH_HINTS = new Set([
  "손해배상의 예정",
  "지적재산권",
  "권리의 양도, 처분 금지",
  "계약의 해제, 해지",
  "면책",
  "준거법",
  "목적 외 사용금지",
]);

const RISK_MID_HINTS = new Set([
  "계약의 내용",
  "계약기간",
  "용역 계약 기간",
  "서비스 대금",
  "계약금의 지급",
  "대금 지급 방법",
  "용역비용",
  "지연배상금",
]);

const RAG_TOP_K = 8;
const FEW_SHOT_COUNT = 3;

function parseLabels(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string");
    }
  } catch {
    /* labels may be comma-separated in edge cases */
  }
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function truncate(text: string, max = 420): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function hintLevel(labels: string[]): "high" | "mid" | "safe" {
  if (labels.some((l) => RISK_HIGH_HINTS.has(l))) return "high";
  if (labels.some((l) => RISK_MID_HINTS.has(l))) return "mid";
  return "safe";
}

async function getCloudflareEnv(): Promise<Env | null> {
  try {
    const { env } = await import("cloudflare:workers");
    return env;
  } catch {
    return null;
  }
}

export async function retrieveStandardClauses(
  contractTypeLabel: string,
  contractText: string,
  geminiApiKey: string,
): Promise<RetrievedClause[]> {
  const env = await getCloudflareEnv();
  if (!env?.VECTORIZE || !env?.contract_db) {
    console.warn("[RAG] Cloudflare bindings 없음 — 컨텍스트 주입 생략");
    return [];
  }

  const serviceTypeId = resolveServiceTypeId(contractTypeLabel);
  const querySnippet = contractText.slice(0, 2000);
  const queryText = `계약유형: ${contractTypeLabel}\n서비스분류: ${serviceTypeId}\n${querySnippet}`;

  const vector = await embedQueryText(queryText, geminiApiKey);

  let matches: VectorizeMatches;
  try {
    matches = await env.VECTORIZE.query(vector, {
      topK: RAG_TOP_K,
      returnMetadata: "indexed",
      filter: { service_type_id: { $eq: serviceTypeId } },
    });
  } catch {
    matches = await env.VECTORIZE.query(vector, {
      topK: RAG_TOP_K,
      returnMetadata: "indexed",
    });
  }

  const ids = matches.matches.map((m) => m.id).filter(Boolean);
  if (!ids.length) return [];

  const placeholders = ids.map(() => "?").join(", ");
  const stmt = env.contract_db.prepare(
    `SELECT id, contract_type, main_category, sub_category, detail_category,
            article_no, labels, content, service_type_id, service_type_label,
            document_name, source_zip, source_file, split
     FROM standard_clauses WHERE id IN (${placeholders})`,
  );

  const { results } = await stmt.bind(...ids).all<StandardClause>();
  const byId = new Map((results ?? []).map((r) => [r.id, r]));

  return matches.matches
    .map((m, idx) => {
      const row = byId.get(m.id);
      if (!row) return null;
      return {
        ...row,
        score: m.score,
        refId: `REF-${idx + 1}`,
      };
    })
    .filter((r): r is RetrievedClause => r !== null);
}

export function buildReferenceContext(clauses: RetrievedClause[]): string {
  if (!clauses.length) {
    return "（검색된 표준 조항 없음 — 일반적인 계약법·표준약관 원칙만으로 분석하고, 확실하지 않은 법조문 번호는 기재하지 마세요.）";
  }

  const lines = clauses.map((c) => {
    const labels = parseLabels(c.labels).join(", ");
    const article = c.article_no != null ? `제${c.article_no}조` : "조항번호 없음";
    return [
      `[${c.refId}] ${c.contract_type} | ${article} | 라벨: ${labels} | 유사도 ${c.score.toFixed(3)}`,
      truncate(c.content),
    ].join("\n");
  });

  return lines.join("\n\n");
}

/** 검색된 표준 조항으로 few-shot 스타일 가이드 생성 */
export function buildFewShotBlock(clauses: RetrievedClause[]): string {
  if (!clauses.length) return "";

  const sorted = [...clauses].sort((a, b) => {
    const order = { high: 0, mid: 1, safe: 2 };
    return order[hintLevel(parseLabels(a.labels))] - order[hintLevel(parseLabels(b.labels))];
  });

  const picked = sorted.slice(0, FEW_SHOT_COUNT);
  const examples = picked.map((c, i) => {
    const labels = parseLabels(c.labels);
    const level = hintLevel(labels);
    const levelKo = level === "high" ? "위험" : level === "mid" ? "주의" : "안전";
    return [
      `### 예시 ${i + 1} (${levelKo} 패턴 · ${c.refId})`,
      `표준 참고 원문: "${truncate(c.content, 280)}"`,
      `라벨: ${labels.join(", ") || "없음"}`,
      `→ 사용자 계약서에 위와 유사·동일 취지의 문구가 있으면 level을 "${level}"(으)로 분류하고,`,
      `  basis 필드에는 반드시 "${c.refId} (${c.contract_type}, ${labels[0] ?? "표준조항"})" 형식으로만 인용하세요.`,
      `  suggestion에는 위 표준 조항을 참고한 즉시 사용 가능한 대안 문구를 작성하세요.`,
    ].join("\n");
  });

  return `## Few-shot 스타일 가이드 (D1/Vectorize 검색 조항 기반)\n\n${examples.join("\n\n")}`;
}

export function buildRagSystemPrompt(
  basePrompt: string,
  referenceContext: string,
  fewShotBlock: string,
): string {
  return `${basePrompt}

## 할루시네이션 방지 (필수)
- 아래 [참조 표준 조항]에 없는 법조문 번호·조항 번호·판례를 지어내지 마세요.
- basis 필드는 [REF-N] 인용 또는 "일반적인 계약 원칙"만 사용하세요.
- 검색 조항과 무관한 내용을 근거로 제시하지 마세요.

## 참조 표준 조항 (Vectorize + D1)
${referenceContext}

${fewShotBlock}`.trim();
}

export function buildRagUserPrompt(contractType: string, contractText: string): string {
  return `계약 유형: ${contractType}

--- 계약서 본문 ---
${contractText}
--- 끝 ---

위 계약서를 분석하세요. [참조 표준 조항]과 Few-shot 가이드를 우선 적용하고, submit_analysis 도구로 결과를 반환하세요.`;
}

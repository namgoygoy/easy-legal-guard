/** /analyze 화면 계약 유형 라벨 → D1/Vectorize service_type_id */
export const CONTRACT_TYPE_TO_SERVICE_ID: Record<string, string> = {
  "디자인 용역": "design",
  "IT/개발 용역": "dev",
  "번역/콘텐츠": "translation",
  "상가 임대차": "lease",
  "가맹/대리점": "franchise",
  "비밀유지(NDA)": "nda",
  "기타 일반": "etc",
};

export function resolveServiceTypeId(contractTypeLabel: string): string {
  return CONTRACT_TYPE_TO_SERVICE_ID[contractTypeLabel] ?? "etc";
}


---

# [업데이트된 PRD] AI 계약서 리스크 검토 서비스 체크리스트

> **마지막 업데이트:** 2026-05-15 22:30
> **현재 상태:** **MVP 인프라 구축 완료** (Cloudflare D1 + Vectorize 연동 성공)
> **데이터 규모:** MVP용 핵심 조항 2,500건 (768차원 벡터 임베딩 완료)

---

### 🔴 0단계: AI-Hub 데이터 전처리 및 RAG 인프라 (완료)

* [x] **데이터 추출 스크립트 작성:** `standard_clauses.jsonl` (131,706행) 생성 완료
* [x] **MVP 소코퍼스(Small Corpus) 구축:** 13만 건 중 핵심 서비스 6종(dev/nda/lease 등) 2,500건 선별 완료
* [x] **카테고리 매핑 및 통계:** `standard_clauses_small.stats.json` 기반 유형별 분포 확정
* [x] **벡터 데이터베이스(RAG) 인프라 구축:**
* [x] **Cloudflare D1:** 원문 데이터 2,500건 업로드 완료 (`contract-db`)
* [x] **Cloudflare Vectorize:** 768차원 벡터 인덱싱 완료 (`contract-index`)
* [x] **대용량 업로드 최적화:** `SQLITE_TOOBIG` 에러 해결(SQL 분할 및 개별 INSERT 방식 적용)



### 🟢 1단계: 개발 환경 및 API 셋팅 (완료)

* [x] **Google AI Studio 직접 연동:** `GEMINI_API_KEY` 기반 `gemini-embedding-2` 호출 환경 구축
* [x] **클라우드 CLI 환경 구축:** `wrangler` 설치 및 Cloudflare 원격 DB/인덱스 제어 환경 셋팅
* [x] **개발 스택 및 PDF 파싱:** TanStack Start + `pdfjs-dist` 기반 구조 확정

### 🟡 2단계: 핵심 AI 프롬프트 설계 (완료)

* [x] **SYSTEM_PROMPT 고도화:** `src/lib/rag.ts` — Vectorize 검색 + D1 원문 → `buildRagSystemPrompt` Context-Injection
* [x] **Few-shot Prompting 추가:** 검색 조항 기반 `buildFewShotBlock` (위험/주의/안전 패턴 + REF 인용)
* [x] **출력 형식(JSON) 정의:** Zod `AnalysisSchema` 정의 완료

### 🔵 3단계: 로직 고도화 및 예외 처리 (진행 중)

* [x] **RAG 검색 로직 통합:** `retrieveStandardClauses` — 임베딩 → Vectorize → D1 (`analyze.functions.ts`)
* [ ] **PDF 예외 처리:** 텍스트 추출 불가(스캔본) 문서 감지 로직 추가
* [x] **모델 선정:** `gemini-2.5-pro` (또는 최신 Flash 모델) 연동 준비 완료

### 🔗 5단계: 프론트-백엔드 통합 (진행 중)

* [x] **Cloudflare Worker 연동:** `cloudflare:workers` env — `VECTORIZE.query` + `contract_db.prepare`
* [x] **서버 함수 연결:** `useServerFn(analyzeContract)` 기반 기본 통신 구조 완료

### 🧪 6단계: 테스트 및 프롬프트 튜닝 (진행 중)

* [x] **RAG 유사도 테스트:** `test_rag_local.py`를 통한 검색 성능 검증 (0.73 이상의 높은 유사도 확인)
* [x] **할루시네이션 방지:** basis에 [REF-N]만 인용·법조문 환각 금지 규칙 프롬프트 반영 (실전 튜닝은 계속)
* [ ] **13만 건 확장 테스트:** MVP 성능 검증 후 전체 데이터 업로드(Batch API 활용 등) 검토

---


---

# [업데이트된 PRD] AI 계약서 리스크 검토 서비스 체크리스트

> **프로젝트 현황 (2026-05-15)** > **저장소:** `github.com/namgoygoy/easy-legal-guard`
> **스택:** TanStack Start + React + Vite (Cloudflare/Lovable)
> **AI:** Gemini 2.5 Pro (현재 Lovable Gateway 사용 중 -> AI Studio 직접 연동 예정)
> **PDF:** `pdfjs-dist` (클라이언트 추출)

---

### 🔴 0단계: AI-Hub 데이터 전처리 (최우선 과제)

본격적인 AI 고도화 이전에 Gemini의 '법률 지식 베이스'를 구축하는 단계입니다.

* [x] **데이터 추출 스크립트 작성:** `scripts/preprocess_aihub.py` — zip 내 JSON 압축 해제 없이 읽기 → `data/processed/standard_clauses.jsonl` (131,706행)
* [x] **표준 조항 라이브러리 구축:** `contract_type · article_no · labels · content` 구조 + `clause_library_summary.json` 집계
* [x] **카테고리 매핑:** `scripts/category_mapping.json` — AI-Hub 카테고리·`content_labels` → 서비스 유형(dev/design/nda/lease/franchise 등)

### 🟢 1단계: 개발 환경 및 API 셋팅

* [ ] **Google AI Studio 직접 연동:** Lovable Gateway를 경유하지 않고 `.env` 파일을 통해 `GEMINI_API_KEY`를 서버 함수에 직접 연결
* [x] **개발 스택 확정:** TanStack Start + React 19 + Tailwind CSS + Cloudflare Workers
* [x] **PDF 파싱 라이브러리 선정:** `pdfjs-dist` (브라우저 측 처리)
* [x] **GitHub 레포지토리 생성:** `easy-legal-guard`

### 🟡 2단계: 핵심 AI 프롬프트 설계 (고도화)

* [ ] **SYSTEM_PROMPT 고도화:** 전처리된 AI-Hub 표준 약관 및 법령 정보를 시스템 메시지에 지식 베이스로 주입
* [ ] **Few-shot Prompting 추가:** `독소 조항 vs 대안 문구` 쌍의 예시 데이터를 10개 이상 추가하여 응답 일관성 확보
* [x] **출력 형식(JSON) 정의:** Zod `AnalysisSchema` + `submit_analysis` tool call

### 🔵 3단계: 로직 고도화 및 예외 처리

* [ ] **PDF 예외 처리 로직 추가:** 암호화된 PDF 및 텍스트 추출이 불가능한 스캔본(OCR 필요) 감지 및 사용자 안내 팝업 구현
* [x] **Gemini 연동 로직:** `google/gemini-2.5-pro` (또는 최신 Flash 모델) 연동
* [x] **데이터 정제:** `tool_choice` 강제 및 `AnalysisSchema` 검증

### 🎨 4단계: UI/UX 디자인 및 프론트엔드

* [x] **러버블 디자인 반영:** 랜딩·업로드·분석 결과 화면 구현 완료
* [x] **업로드 컴포넌트:** PDF 선택 및 본문 붙여넣기 기능
* [x] **결과 대시보드:** 위험도 필터링 및 컬러 코딩 적용
* [x] **비교 뷰(Side-by-Side):** 기존 문구 vs 추천 문구 비교 및 복사 기능

### 🔗 5단계: 프론트-백엔드 통합

* [x] **서버 함수 연결:** `useServerFn(analyzeContract)` 기반 통신
* [x] **결과 렌더링:** 분석 데이터 매핑 완료
* [ ] **에러 핸들링 강화:** API 할당량 초과, 네트워크 오류 외에 '문서 읽기 실패' 케이스 상세화

### 🧪 6단계: 테스트 및 프롬프트 튜닝

* [ ] **샘플 테스트:** AI-Hub `Validation` 세트를 활용하여 실제 정확도(Ground Truth 대비 정답률) 검증
* [ ] **할루시네이션 방지:** 법조문 번호나 약관 근거를 생성할 때 지식 베이스(JSONL) 외부 내용을 지어내지 않도록 프롬프트 튜닝
* [x] **면책 조항 삽입:** 법적 효력 없음 문구 배치 완료

### 🚀 7단계: 배포 및 모니터링

* [ ] **공개 배포:** Cloudflare Pages/Workers를 통한 최종 도메인 연결
* [ ] **분석 모니터링:** 분석 실패 로그를 수집하여 프롬프트 개선에 활용
* [ ] **피드백 루프:** 프리랜서/소상공인 대상 초기 유저 테스트 진행

---

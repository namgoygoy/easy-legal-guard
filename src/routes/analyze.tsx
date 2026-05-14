import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, Loader2, AlertTriangle, ShieldCheck, ChevronDown, Copy, Check, ArrowLeft, Sparkles, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { extractTextFromPdf } from "@/lib/pdf";
import { analyzeContract, type AnalysisResult } from "@/lib/analyze.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/analyze")({
  component: AnalyzePage,
  head: () => ({
    meta: [
      { title: "계약서 검토 — 안심계약 AI" },
      { name: "description", content: "PDF 또는 텍스트로 계약서를 업로드하면 AI가 독소 조항을 찾아드립니다." },
    ],
  }),
});

const CONTRACT_TYPES = [
  { id: "design", label: "디자인 용역" },
  { id: "dev", label: "IT/개발 용역" },
  { id: "translation", label: "번역/콘텐츠" },
  { id: "lease", label: "상가 임대차" },
  { id: "franchise", label: "가맹/대리점" },
  { id: "nda", label: "비밀유지(NDA)" },
  { id: "etc", label: "기타 일반" },
];

type Stage = "upload" | "analyzing" | "result";

function AnalyzePage() {
  const [stage, setStage] = useState<Stage>("upload");
  const [contractType, setContractType] = useState(CONTRACT_TYPES[0].label);
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const analyze = useServerFn(analyzeContract);

  const handleStart = useCallback(async () => {
    setError(null);
    try {
      let text = pastedText.trim();
      if (file) {
        setStage("analyzing");
        text = await extractTextFromPdf(file);
      }
      if (text.length < 50) {
        setStage("upload");
        toast.error("계약서 내용이 너무 짧습니다. 최소 50자 이상 필요해요.");
        return;
      }
      setStage("analyzing");
      const res = await analyze({ data: { contractType, text: text.slice(0, 120_000) } });
      setResult(res);
      setStage("result");
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "분석 중 오류가 발생했습니다.";
      setError(msg);
      toast.error(msg);
      setStage("upload");
    }
  }, [file, pastedText, contractType, analyze]);

  return (
    <div className="min-h-screen bg-gradient-soft">
      <Toaster position="top-center" richColors />
      <header className="border-b border-border bg-background/70 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Logo />
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> 홈으로
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 sm:py-16">
        <AnimatePresence mode="wait">
          {stage === "upload" && (
            <UploadStage
              key="upload"
              file={file}
              setFile={setFile}
              contractType={contractType}
              setContractType={setContractType}
              pastedText={pastedText}
              setPastedText={setPastedText}
              onStart={handleStart}
              error={error}
            />
          )}
          {stage === "analyzing" && <AnalyzingStage key="analyzing" />}
          {stage === "result" && result && (
            <ResultStage
              key="result"
              result={result}
              onReset={() => {
                setStage("upload");
                setFile(null);
                setPastedText("");
                setResult(null);
              }}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function UploadStage(props: {
  file: File | null;
  setFile: (f: File | null) => void;
  contractType: string;
  setContractType: (s: string) => void;
  pastedText: string;
  setPastedText: (s: string) => void;
  onStart: () => void;
  error: string | null;
}) {
  const { file, setFile, contractType, setContractType, pastedText, setPastedText, onStart, error } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type === "application/pdf") setFile(f);
    else toast.error("PDF 파일만 지원됩니다.");
  };

  const canStart = (file !== null || pastedText.trim().length >= 50);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
      <div className="text-center max-w-2xl mx-auto">
        <span className="inline-flex items-center gap-2 rounded-full bg-accent text-primary-glow px-3 py-1.5 text-xs font-bold">
          <Sparkles className="h-3.5 w-3.5" /> AI 계약 검토
        </span>
        <h1 className="mt-4 font-serif text-4xl sm:text-5xl font-bold tracking-tight">
          어떤 계약서를 검토해드릴까요?
        </h1>
        <p className="mt-4 text-muted-foreground">
          PDF 파일을 올리거나, 계약서 본문을 붙여넣기 해주세요.
        </p>
      </div>

      <div className="mt-12 grid lg:grid-cols-[1.5fr_1fr] gap-6">
        {/* Upload area */}
        <div className="bg-card rounded-3xl border border-border shadow-soft p-6 sm:p-8">
          <label className="text-sm font-bold text-foreground">1. 계약서 첨부</label>

          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`mt-3 cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
              drag ? "border-primary-glow bg-accent/50" : "border-border hover:border-primary-glow/50 hover:bg-secondary/40"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFile(f);
              }}
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-accent grid place-items-center text-primary-glow">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="ml-2 h-8 w-8 grid place-items-center rounded-full hover:bg-muted text-muted-foreground"
                  aria-label="파일 제거"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="mx-auto h-14 w-14 rounded-2xl bg-accent grid place-items-center text-primary-glow">
                  <Upload className="h-7 w-7" />
                </div>
                <p className="mt-4 font-bold text-foreground">PDF를 끌어다 놓거나 클릭하여 선택</p>
                <p className="mt-1 text-sm text-muted-foreground">파일은 분석 후 즉시 폐기됩니다</p>
              </>
            )}
          </div>

          <div className="mt-6">
            <label className="text-sm font-bold text-foreground">또는 본문 붙여넣기</label>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="계약서 텍스트를 여기에 붙여넣으세요 (최소 50자)"
              className="mt-2 w-full h-40 rounded-2xl border border-border bg-background p-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <p className="mt-1 text-xs text-muted-foreground text-right">{pastedText.length.toLocaleString()}자</p>
          </div>
        </div>

        {/* Settings */}
        <div className="bg-card rounded-3xl border border-border shadow-soft p-6 sm:p-8 h-fit lg:sticky lg:top-24">
          <label className="text-sm font-bold text-foreground">2. 계약 유형 선택</label>
          <p className="mt-1 text-xs text-muted-foreground">유형에 맞는 표준약관을 기준으로 검토합니다</p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {CONTRACT_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setContractType(t.label)}
                className={`px-3 py-2.5 rounded-xl text-sm font-medium transition border ${
                  contractType === t.label
                    ? "bg-primary text-primary-foreground border-primary shadow-soft"
                    : "bg-background text-foreground border-border hover:border-primary-glow/40"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            onClick={onStart}
            disabled={!canStart}
            className="mt-8 w-full rounded-full bg-primary text-primary-foreground py-3.5 font-bold hover:bg-primary-glow transition disabled:opacity-40 disabled:cursor-not-allowed shadow-elevated"
          >
            검토 시작하기
          </button>
          {error && <p className="mt-3 text-xs text-destructive text-center">{error}</p>}
          <p className="mt-3 text-[11px] text-muted-foreground text-center leading-relaxed">
            본 분석은 참고용이며, 법적 자문을 대체하지 않습니다.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function AnalyzingStage() {
  const messages = [
    "계약서를 꼼꼼히 읽고 있어요…",
    "독소 조항을 찾고 있어요…",
    "표준약관과 대조 중이에요…",
    "안전한 대안 문구를 작성 중이에요…",
  ];
  const [i, setI] = useState(0);
  if (typeof window !== "undefined") {
    setTimeout(() => setI((p) => (p + 1) % messages.length), 2200);
  }
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center py-32"
    >
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary-glow/20 blur-2xl animate-pulse" />
        <div className="relative h-24 w-24 rounded-full bg-gradient-hero grid place-items-center shadow-glow">
          <Loader2 className="h-10 w-10 text-white animate-spin" />
        </div>
      </div>
      <h2 className="mt-10 font-serif text-3xl font-bold tracking-tight">검토 중입니다</h2>
      <AnimatePresence mode="wait">
        <motion.p
          key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="mt-3 text-muted-foreground"
        >
          {messages[i]}
        </motion.p>
      </AnimatePresence>
      <div className="mt-8 w-64 h-1.5 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full bg-gradient-hero"
          initial={{ width: "10%" }}
          animate={{ width: "95%" }}
          transition={{ duration: 25, ease: "easeOut" }}
        />
      </div>
    </motion.div>
  );
}

function ResultStage({ result, onReset }: { result: AnalysisResult; onReset: () => void }) {
  const [filter, setFilter] = useState<"all" | "high" | "mid" | "safe">("all");
  const filtered = filter === "all" ? result.clauses : result.clauses.filter((c) => c.level === filter);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      {/* Score panel */}
      <div className="bg-gradient-hero text-white rounded-3xl p-8 sm:p-10 shadow-elevated relative overflow-hidden">
        <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="relative grid sm:grid-cols-[auto_1fr_auto] gap-8 items-center">
          <div className="flex flex-col items-center">
            <div className="relative h-32 w-32">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="white"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(result.overallScore / 100) * 264} 264`}
                />
              </svg>
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <div className="font-serif text-4xl font-bold">{result.overallScore}</div>
                  <div className="text-[10px] text-white/60 uppercase tracking-widest">/ 100</div>
                </div>
              </div>
            </div>
          </div>
          <div>
            <span className="text-xs font-bold tracking-widest text-white/60 uppercase">종합 위험도</span>
            <h2 className="mt-2 font-serif text-3xl sm:text-4xl font-bold leading-tight">
              {scoreLabel(result.overallScore)}
            </h2>
            <p className="mt-3 text-white/80 leading-relaxed max-w-2xl">{result.summary}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Pill count={result.riskCounts.high} label="위험" tone="high" />
              <Pill count={result.riskCounts.mid} label="주의" tone="mid" />
              <Pill count={result.riskCounts.safe} label="안전" tone="safe" />
            </div>
          </div>
          <button
            onClick={onReset}
            className="self-start rounded-full bg-white/10 backdrop-blur ring-1 ring-white/20 hover:bg-white/20 transition px-5 py-2.5 text-sm font-medium"
          >
            새 계약서 검토
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-10 flex flex-wrap gap-2 items-center">
        <span className="text-sm font-bold text-foreground mr-2">필터:</span>
        {([
          { k: "all", l: "전체", n: result.clauses.length },
          { k: "high", l: "위험", n: result.riskCounts.high },
          { k: "mid", l: "주의", n: result.riskCounts.mid },
          { k: "safe", l: "안전", n: result.riskCounts.safe },
        ] as const).map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${
              filter === f.k
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:border-primary-glow/40"
            }`}
          >
            {f.l} <span className="opacity-60">({f.n})</span>
          </button>
        ))}
      </div>

      {/* Clauses */}
      <div className="mt-6 space-y-4">
        {filtered.map((c, idx) => (
          <ClauseCard key={c.id || idx} clause={c} />
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-12">해당 등급의 조항이 없습니다.</p>
        )}
      </div>
    </motion.div>
  );
}

function ClauseCard({ clause }: { clause: AnalysisResult["clauses"][number] }) {
  const [open, setOpen] = useState(clause.level === "high");
  const [copied, setCopied] = useState(false);
  const cfg = LEVEL_CFG[clause.level];

  const copy = () => {
    navigator.clipboard.writeText(clause.suggestion);
    setCopied(true);
    toast.success("대안 문구가 복사되었습니다");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-card rounded-3xl border border-border shadow-soft overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-4 p-5 sm:p-6 text-left hover:bg-secondary/30 transition">
        <span className={`shrink-0 inline-flex items-center gap-1.5 ${cfg.bg} ${cfg.fg} px-3 py-1 rounded-full text-xs font-bold`}>
          {cfg.icon} {cfg.label}
        </span>
        <h3 className="flex-1 font-bold text-foreground">{clause.title}</h3>
        <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-5 sm:px-6 pb-6 space-y-5">
              {/* Plain explanation */}
              <div className="rounded-2xl bg-accent/40 p-4 text-sm leading-relaxed text-foreground">
                <span className="font-bold text-primary-glow">쉽게 풀이</span>
                <p className="mt-1.5">{clause.plain}</p>
              </div>

              {/* Side by side */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className={`rounded-2xl border ${cfg.borderSoft} p-5`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${cfg.fg}`}>기존 문구</span>
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed text-foreground font-serif">
                    “{clause.original}”
                  </p>
                </div>
                <div className="rounded-2xl border border-risk-safe/30 bg-risk-safe-bg/40 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-risk-safe">추천 문구</span>
                    <button onClick={copy} className="inline-flex items-center gap-1 text-xs font-bold text-risk-safe hover:underline">
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "복사됨" : "복사"}
                    </button>
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed text-foreground font-serif">
                    “{clause.suggestion}”
                  </p>
                </div>
              </div>

              {/* Issue + basis */}
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">왜 문제인가요</span>
                  <p className="mt-1.5 leading-relaxed text-foreground">{clause.issue}</p>
                </div>
                <div>
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">법적 근거</span>
                  <p className="mt-1.5 leading-relaxed text-foreground">{clause.basis}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Pill({ count, label, tone }: { count: number; label: string; tone: "high" | "mid" | "safe" }) {
  const map = {
    high: "bg-risk-high/90 text-white",
    mid: "bg-risk-mid/90 text-white",
    safe: "bg-risk-safe/90 text-white",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 ${map[tone]} px-3 py-1 rounded-full text-xs font-bold`}>
      {label} {count}
    </span>
  );
}

const LEVEL_CFG = {
  high: { label: "위험", bg: "bg-risk-high-bg", fg: "text-risk-high", borderSoft: "border-risk-high/30 bg-risk-high-bg/40", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  mid: { label: "주의", bg: "bg-risk-mid-bg", fg: "text-risk-mid", borderSoft: "border-risk-mid/30 bg-risk-mid-bg/40", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  safe: { label: "안전", bg: "bg-risk-safe-bg", fg: "text-risk-safe", borderSoft: "border-risk-safe/30 bg-risk-safe-bg/40", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
} as const;

function scoreLabel(s: number) {
  if (s >= 80) return "전반적으로 안전한 계약입니다";
  if (s >= 60) return "일부 주의가 필요합니다";
  if (s >= 40) return "수정 협의가 권장됩니다";
  return "재협상이 강력히 권장됩니다";
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ShieldCheck, FileSearch, Sparkles, ArrowRight, Eye, ScrollText, Languages, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "안심계약 AI — 독소조항을 30초 만에 찾아드립니다" },
      { name: "description", content: "프리랜서·소상공인을 위한 AI 계약서 리스크 검토. PDF 업로드 한 번으로 위험 조항을 찾고, 바로 쓸 수 있는 대안 문구까지 받아보세요." },
      { property: "og:title", content: "안심계약 AI — 어려운 계약서, AI가 대신 읽어드릴게요" },
      { property: "og:description", content: "독소 조항 탐지부터 안전한 대안 문구 추천까지. 30초 안에 끝나는 계약서 검토." },
    ],
  }),
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="absolute top-0 inset-x-0 z-20">
        <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between">
          <Logo light />
          <nav className="hidden sm:flex items-center gap-7 text-sm text-white/70">
            <a href="#features" className="hover:text-white transition">기능</a>
            <a href="#how" className="hover:text-white transition">검토 과정</a>
            <a href="#who" className="hover:text-white transition">이런 분께</a>
          </nav>
          <Link
            to="/analyze"
            className="inline-flex items-center gap-1.5 rounded-full bg-white text-primary px-4 py-2 text-sm font-semibold hover:bg-white/90 transition shadow-soft"
          >
            검토 시작 <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative bg-gradient-hero text-white overflow-hidden">
        <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_20%_20%,white_0,transparent_40%),radial-gradient(circle_at_80%_60%,oklch(0.7_0.2_280)_0,transparent_45%)]" />
        <div className="relative mx-auto max-w-7xl px-6 pt-36 pb-28 lg:pb-36">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-xs font-medium text-white/90 ring-1 ring-white/20">
              <Sparkles className="h-3.5 w-3.5" /> Gemini 2.5 Pro 기반 계약 검토
            </span>
            <h1 className="mt-6 font-serif text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight">
              어려운 계약서,<br />
              <span className="text-white/80">AI가 대신 읽어드릴게요.</span>
            </h1>
            <p className="mt-7 text-lg sm:text-xl text-white/75 max-w-2xl leading-relaxed">
              프리랜서·소상공인을 위한 독소 조항 탐지 서비스.
              <br className="hidden sm:block" />
              PDF 한 장 올리면, 30초 안에 위험 조항과 안전한 대안 문구까지 알려드립니다.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                to="/analyze"
                className="inline-flex items-center gap-2 rounded-full bg-white text-primary px-7 py-3.5 text-base font-bold hover:bg-white/90 transition shadow-glow"
              >
                내 계약서 검토하기 <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur ring-1 ring-white/20 text-white px-7 py-3.5 text-base font-medium hover:bg-white/20 transition"
              >
                어떻게 작동하나요?
              </a>
            </div>
            <p className="mt-6 text-xs text-white/50">
              로그인 없이 바로 사용 · 업로드한 파일은 분석 후 즉시 폐기됩니다
            </p>
          </motion.div>

          {/* Floating cards preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mt-20 grid sm:grid-cols-3 gap-4 max-w-4xl"
          >
            <PreviewCard level="high" title="지식재산권 무상 귀속" />
            <PreviewCard level="mid" title="무제한 수정 요구" />
            <PreviewCard level="safe" title="대금 지급 시기 명시" />
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border bg-background">
        <div className="mx-auto max-w-7xl px-6 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8">
          <Stat n="30초" label="평균 분석 시간" />
          <Stat n="12종" label="탐지 가능 위험 유형" />
          <Stat n="3단계" label="리스크 등급" />
          <Stat n="0원" label="기본 검토 비용" />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-gradient-soft">
        <div className="mx-auto max-w-7xl px-6 py-24 lg:py-32">
          <div className="max-w-2xl">
            <span className="text-xs font-bold tracking-widest text-primary-glow uppercase">FEATURES</span>
            <h2 className="mt-3 font-serif text-4xl sm:text-5xl font-bold text-foreground tracking-tight">
              계약서를 읽는 게<br />부담스럽지 않도록
            </h2>
            <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
              법률 전문가가 옆에 있다면 받았을 도움을, AI가 30초 안에 정리해드립니다.
            </p>
          </div>

          <div className="mt-16 grid md:grid-cols-2 gap-5">
            <FeatureCard
              icon={<FileSearch />}
              title="독소 조항 탐지"
              desc="공정거래위원회 표준약관과 대조해 위험·주의·안전 3단계로 분류합니다."
              accent="risk-high"
            />
            <FeatureCard
              icon={<Eye />}
              title="Side-by-Side 비교"
              desc="기존 문구 vs 추천 문구를 한눈에. 어디를 어떻게 바꿔야 할지 명확합니다."
              accent="primary"
            />
            <FeatureCard
              icon={<Languages />}
              title="쉬운 말 풀이"
              desc="한자어, 일본식 표현, 법률 용어를 일상 언어로 다시 써드려요."
              accent="risk-mid"
            />
            <FeatureCard
              icon={<ScrollText />}
              title="법적 근거 제시"
              desc="왜 그 조항이 문제인지, 어떤 표준약관·법령에 어긋나는지 함께 안내합니다."
              accent="risk-safe"
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-background">
        <div className="mx-auto max-w-6xl px-6 py-24 lg:py-32">
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-xs font-bold tracking-widest text-primary-glow uppercase">PROCESS</span>
            <h2 className="mt-3 font-serif text-4xl sm:text-5xl font-bold text-foreground tracking-tight">
              세 번의 클릭이면 충분합니다
            </h2>
          </div>

          <div className="mt-16 grid md:grid-cols-3 gap-6">
            <Step n="01" title="PDF 업로드" desc="검토받을 계약서 PDF를 끌어다 놓거나 선택합니다." />
            <Step n="02" title="유형 선택" desc="용역·임대차·가맹 등 계약 유형을 선택해 정밀도를 높입니다." />
            <Step n="03" title="결과 확인" desc="위험 조항 리스트와 즉시 사용 가능한 대안 문구를 확인합니다." />
          </div>

          <div className="mt-16 text-center">
            <Link
              to="/analyze"
              className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-7 py-3.5 text-base font-bold hover:bg-primary-glow transition shadow-elevated"
            >
              지금 검토 시작하기 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Who */}
      <section id="who" className="bg-secondary/40 border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-xs font-bold tracking-widest text-primary-glow uppercase">FOR YOU</span>
              <h2 className="mt-3 font-serif text-4xl sm:text-5xl font-bold text-foreground tracking-tight">
                혼자 계약서를 마주한<br />모든 사람을 위해
              </h2>
              <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
                법무팀이 없는 1인 사업자, 첫 외주 계약을 앞둔 신입 프리랜서, 임대차 계약이 두려운 자영업자. 안심계약 AI는 당신 편입니다.
              </p>
            </div>
            <ul className="space-y-4">
              {[
                "디자이너·개발자·번역가 등 용역 프리랜서",
                "상가·사무실 임대차 계약 앞둔 자영업자",
                "가맹·대리점 계약을 검토 중인 예비 창업자",
                "외주 발주서·NDA를 자주 받는 1인 기업",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3 bg-card rounded-2xl p-5 shadow-soft border border-border">
                  <CheckCircle2 className="h-5 w-5 text-risk-safe shrink-0 mt-0.5" />
                  <span className="text-foreground font-medium">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-6 py-12 flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
          <Logo light />
          <p className="text-sm text-white/60 max-w-md">
            본 서비스는 참고용 분석을 제공하며, 법적 자문을 대체하지 않습니다. 중요 계약은 변호사와 상의하세요.
          </p>
        </div>
      </footer>
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <div className="font-serif text-3xl sm:text-4xl font-bold text-foreground">{n}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function FeatureCard({ icon, title, desc, accent }: { icon: React.ReactNode; title: string; desc: string; accent: string }) {
  const ringMap: Record<string, string> = {
    "risk-high": "bg-risk-high-bg text-risk-high",
    "risk-mid": "bg-risk-mid-bg text-risk-mid",
    "risk-safe": "bg-risk-safe-bg text-risk-safe",
    "primary": "bg-accent text-primary-glow",
  };
  return (
    <div className="group bg-card rounded-3xl p-8 border border-border shadow-soft hover:shadow-elevated transition-all hover:-translate-y-0.5">
      <div className={`h-12 w-12 rounded-2xl grid place-items-center ${ringMap[accent]}`}>
        <div className="h-6 w-6">{icon}</div>
      </div>
      <h3 className="mt-6 text-xl font-bold text-foreground">{title}</h3>
      <p className="mt-2 text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="relative bg-card rounded-3xl p-8 border border-border shadow-soft">
      <div className="font-serif text-5xl font-bold text-primary-glow/30">{n}</div>
      <h3 className="mt-3 text-xl font-bold text-foreground">{title}</h3>
      <p className="mt-2 text-muted-foreground">{desc}</p>
    </div>
  );
}

function PreviewCard({ level, title }: { level: "high" | "mid" | "safe"; title: string }) {
  const cfg = {
    high: { bg: "bg-risk-high-bg", fg: "text-risk-high", label: "위험", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    mid: { bg: "bg-risk-mid-bg", fg: "text-risk-mid", label: "주의", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    safe: { bg: "bg-risk-safe-bg", fg: "text-risk-safe", label: "안전", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  }[level];
  return (
    <div className="bg-white/95 backdrop-blur rounded-2xl p-5 shadow-elevated text-foreground">
      <span className={`inline-flex items-center gap-1 ${cfg.bg} ${cfg.fg} px-2.5 py-1 rounded-full text-xs font-bold`}>
        {cfg.icon} {cfg.label}
      </span>
      <p className="mt-3 font-bold text-sm">{title}</p>
      <div className="mt-3 space-y-1.5">
        <div className="h-1.5 rounded-full bg-muted w-full" />
        <div className="h-1.5 rounded-full bg-muted w-4/5" />
        <div className="h-1.5 rounded-full bg-muted w-3/5" />
      </div>
    </div>
  );
}

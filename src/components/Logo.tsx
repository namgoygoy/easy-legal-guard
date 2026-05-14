import { ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 group">
      <div className={`h-9 w-9 rounded-xl grid place-items-center ${light ? "bg-white/10 text-white" : "bg-primary text-primary-foreground"} transition-transform group-hover:scale-105`}>
        <ShieldCheck className="h-5 w-5" />
      </div>
      <div className="flex flex-col leading-none">
        <span className={`text-base font-bold tracking-tight ${light ? "text-white" : "text-foreground"}`}>안심계약 AI</span>
        <span className={`text-[10px] font-medium ${light ? "text-white/60" : "text-muted-foreground"}`}>Ansim Contract</span>
      </div>
    </Link>
  );
}

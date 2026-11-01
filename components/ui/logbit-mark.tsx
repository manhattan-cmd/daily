import { MARK, type MarkPart } from "@/lib/brand";

/** Bir parça: önce siyah gölgesi (kaydırılmış), üstünde kendi rengi + çerçeve */
function Part({ p, fill, shadow }: { p: MarkPart; fill: string; shadow?: boolean }) {
  const common = {
    fill,
    stroke: MARK.ink,
    strokeWidth: MARK.stroke,
    strokeLinejoin: "round" as const,
    transform: shadow ? `translate(${MARK.shadow} ${MARK.shadow})` : undefined,
  };
  return p.kind === "rect" ? (
    <rect x={p.x} y={p.y} width={p.size} height={p.size} rx={p.r} {...common} />
  ) : (
    <circle cx={p.cx} cy={p.cy} r={p.r} {...common} />
  );
}

/**
 * Logbit logosu (bit ızgarası) — zemini dahil, kare; köşe yuvarlaklığı ve
 * çerçeve kullanılan yerde verilir (bkz. lib/brand).
 */
export function LogbitMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <rect width="512" height="512" fill={MARK.bg} />
      {MARK.parts.map((p, i) => (
        <g key={i}>
          <Part p={p} fill={MARK.ink} shadow />
          <Part p={p} fill={p.fill} />
        </g>
      ))}
    </svg>
  );
}

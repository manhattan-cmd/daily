import { useId, type SVGProps } from "react";
import { MARK, type MarkBit, type MarkSquare } from "@/lib/brand";

const stroke = { stroke: MARK.ink, strokeWidth: MARK.stroke, strokeLinejoin: "round" as const };
const shadow = `translate(${MARK.shadow} ${MARK.shadow})`;

const Sq = ({ q, ...rest }: { q: MarkSquare } & SVGProps<SVGRectElement>) => (
  <rect x={q.x} y={q.y} width={q.size} height={q.size} rx={q.r} {...rest} />
);
const Bit = ({ b, ...rest }: { b: MarkBit } & SVGProps<SVGCircleElement>) => (
  <circle cx={b.cx} cy={b.cy} r={b.r} {...rest} />
);

/**
 * Logbit logosu (paylaşılan bit) — zemini dahil, kare; köşe yuvarlaklığı ve
 * çerçeve kullanılan yerde verilir (bkz. lib/brand). Sıra: gölgeler, dolgular,
 * kareye göre kırpılmış yeşil kesişimler, en üstte çerçeveler.
 */
export function LogbitMark({ className }: { className?: string }) {
  // kırpma kimliği her kopyada ayrı (useId'deki ":" url(#…) içinde sorun çıkarır)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const b = MARK.bit;
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <defs>
        {MARK.squares.map((q, i) => (
          <clipPath key={i} id={`${uid}-${i}`}>
            <Sq q={q} />
          </clipPath>
        ))}
      </defs>
      <rect width="512" height="512" fill={MARK.bg} />
      {MARK.squares.map((q, i) => (
        <Sq key={i} q={q} fill={MARK.ink} {...stroke} transform={shadow} />
      ))}
      <Bit b={b} fill={MARK.ink} {...stroke} transform={shadow} />
      {MARK.squares.map((q, i) => (
        <Sq key={i} q={q} fill={q.fill} />
      ))}
      <Bit b={b} fill={b.fill} />
      {MARK.squares.map((_, i) => (
        <Bit key={i} b={b} fill={MARK.meet} clipPath={`url(#${uid}-${i})`} />
      ))}
      {MARK.squares.map((q, i) => (
        <Sq key={i} q={q} fill="none" {...stroke} />
      ))}
      <Bit b={b} fill="none" {...stroke} />
    </svg>
  );
}

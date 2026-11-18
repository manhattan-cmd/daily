"use client";

/**
 * "Yaptım" anının kıvılcımları — dairenin etrafında açılan halka ve dört
 * bir yana dağılan küçük parçalar. Ses (lib/sound "goal") ile aynı anda
 * başlar; 0,8 saniyede biter, iz bırakmaz. Hareket azaltılmışsa çizilmez
 * (bkz. globals.css goal-*).
 *
 * Parçaların yeri sabit hesaplanıyor (rastgele değil): her kutlama aynı
 * şekli çizer, çizim de saf kalır.
 */
const PALETTE = ["#ffd23f", "#7ae582", "#ff9ecd", "#8ea6ff", "#ffb38a"];
const N = 18;

const SPARKS = Array.from({ length: N }, (_, i) => {
  const a = (i / N) * Math.PI * 2 + (i % 2 ? 0.2 : 0);
  const r = 42 + (i % 3) * 13;
  return {
    dx: Math.round(Math.cos(a) * r),
    dy: Math.round(Math.sin(a) * r),
    size: i % 3 === 0 ? 10 : 7,
    square: i % 4 === 1,
    delay: (i % 3) * 30,
    palette: i % PALETTE.length,
  };
});

export function GoalBurst({ color }: { color: string }) {
  return (
    <span aria-hidden data-goal-burst="" className="pointer-events-none absolute inset-0">
      <span className="goal-ring absolute inset-0 rounded-full border-[3px]" style={{ borderColor: color }} />
      <span
        className="goal-ring absolute inset-0 rounded-full border-2"
        style={{ borderColor: PALETTE[0], animationDelay: "90ms" }}
      />
      {SPARKS.map((s, i) => (
        <span
          key={i}
          className="goal-spark absolute left-1/2 top-1/2"
          style={
            {
              width: s.size,
              height: s.size,
              marginLeft: -s.size / 2,
              marginTop: -s.size / 2,
              borderRadius: s.square ? 2 : 999,
              background: i % 3 === 2 ? color : PALETTE[s.palette],
              animationDelay: `${s.delay}ms`,
              "--dx": `${s.dx}px`,
              "--dy": `${s.dy}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}

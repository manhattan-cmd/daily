"use client";

import { useEffect, useState } from "react";
import { Battery, Wifi, Signal } from "lucide-react";

export function StatusBar() {
  const [time, setTime] = useState("");

  useEffect(() => {
    function update() {
      setTime(
        new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }
    update();
    const id = setInterval(update, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hidden md:flex shrink-0 items-center justify-between px-7 pt-4 pb-1">
      <span className="text-[13px] font-semibold tabular-nums text-foreground">
        {time}
      </span>
      <div className="flex items-center gap-1.5 text-foreground">
        <Signal className="h-3.5 w-3.5" />
        <Wifi className="h-3.5 w-3.5" />
        <Battery className="h-3.5 w-3.5" />
      </div>
    </div>
  );
}

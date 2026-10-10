"use client";

import { useState } from "react";
import { InOutBars } from "@/components/charts";
import { months } from "./samples";

/** The 12-month bars with a month you can pick, as on the Money in, money out board. */
export function InOutDemo() {
  const [selected, setSelected] = useState(months.at(-1)!.key);
  const month = months.find((m) => m.key === selected)!;
  return (
    <>
      <p className="small sub" style={{ margin: "0 0 12px" }}>
        Picked: <span style={{ color: "var(--text)", fontWeight: 600 }}>{month.name}</span>
      </p>
      <InOutBars
        label="Money in and out, last 12 months"
        months={months}
        selected={selected}
        onSelect={setSelected}
      />
    </>
  );
}

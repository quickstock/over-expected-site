import { useRef } from "react";
import { divergingText } from "../lib/color";
import { signed } from "../lib/format";
import { useCountUp } from "../lib/useCountUp";
import { useRevealed } from "../lib/useRevealed";

/**
 * A signed over-expected figure in the diverging encoding that counts up from
 * zero the first time it scrolls into view, and from its old value to the new
 * one when the season changes. The colour is the final value's from the first
 * frame, and the box is sized to the final string, so the count never shifts
 * the line it sits in. Screen readers get the final figure only.
 */
export function CountDelta({
  value,
  decimals = 1,
  className = "",
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const revealed = useRevealed(ref, 0.6);
  const shown = useCountUp(revealed ? value : 0, 900);
  const final = signed(value, decimals);
  return (
    <span
      ref={ref}
      className={`inline-block text-right font-mono tnum ${className}`}
      style={{ color: divergingText(value), minWidth: `${final.length}ch` }}
    >
      <span className="sr-only">{final}</span>
      <span aria-hidden="true">{signed(shown, decimals)}</span>
    </span>
  );
}

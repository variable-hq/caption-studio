"use client";
import { useCallback, useState } from "react";
import { addRecentOutput, type RecentOutput } from "@/live/recent-outputs";

export function useRecentOutputs() {
  const [outputs, setOutputs] = useState<RecentOutput[]>([]);
  const record = useCallback((entry: RecentOutput) => setOutputs((current) => addRecentOutput(current, entry)), []);
  const reset = useCallback(() => setOutputs([]), []);
  return { outputs, record, reset };
}

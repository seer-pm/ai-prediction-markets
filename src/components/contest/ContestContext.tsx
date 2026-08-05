import { useMemo, type ReactNode } from "react";
import { ContestContext } from "./contestState";

export function ContestProvider({
  finished,
  children,
}: {
  finished: boolean;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ finished }), [finished]);
  return <ContestContext.Provider value={value}>{children}</ContestContext.Provider>;
}

import { useCallback, useRef } from "react";

/** Stable callback identity with the semantics used by React 19 events. */
export function useEvent<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(
    (...args: Args) => callbackRef.current(...args),
    [],
  );
}

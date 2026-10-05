import { useEffect, useId, useState } from "react";
import logoUrl from "../../../shared/brand/karamah-logo.svg";

export function BrandLoadingScreen({ startup = false }) {
  const [phase, setPhase] = useState("running");
  const outlineFilterId = useId().replaceAll(":", "");

  useEffect(() => {
    if (!startup) return undefined;
    const closeTimer = window.setTimeout(() => setPhase("closing"), 1900);
    const removeTimer = window.setTimeout(() => setPhase("removed"), 2180);
    return () => {
      window.clearTimeout(closeTimer);
      window.clearTimeout(removeTimer);
    };
  }, [startup]);

  if (phase === "removed") return null;

  return (
    <div
      className={`pp-brand-loader is-${phase}`}
      role="status"
      aria-label="Loading Karamah Collective"
      aria-hidden={phase === "closing" ? "true" : undefined}
    >
      <div className="pp-brand-loader-mark pp-loader-written">
        <svg
          className="pp-loader-written-logo"
          viewBox="0 0 375 375"
          role="img"
          aria-label="Karamah Collective"
        >
          <defs>
            <filter
              id={outlineFilterId}
              x="-8%"
              y="-8%"
              width="116%"
              height="116%"
              colorInterpolationFilters="sRGB"
            >
              <feMorphology
                in="SourceAlpha"
                operator="dilate"
                radius="1.5"
                result="spread"
              />
              <feComposite
                in="spread"
                in2="SourceAlpha"
                operator="out"
                result="edge"
              />
              <feFlood floodColor="currentColor" result="color" />
              <feComposite in="color" in2="edge" operator="in" />
            </filter>
          </defs>
          <g className="pp-loader-written-outline">
            <image
              href={logoUrl}
              width="375"
              height="375"
              filter={`url(#${outlineFilterId})`}
            />
          </g>
          <image
            className="pp-loader-written-fill"
            href={logoUrl}
            width="375"
            height="375"
          />
        </svg>
        <span aria-hidden="true" />
      </div>
    </div>
  );
}

export default function StartupScreen() {
  return <BrandLoadingScreen startup />;
}

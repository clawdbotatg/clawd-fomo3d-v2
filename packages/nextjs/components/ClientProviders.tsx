"use client";

import dynamic from "next/dynamic";

const ScaffoldEthAppWithProviders = dynamic(
  () => import("~~/components/ScaffoldEthAppWithProviders").then(mod => ({ default: mod.ScaffoldEthAppWithProviders })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col min-h-screen items-center justify-center" style={{ background: "#0a0a0a" }}>
        <div className="text-4xl animate-pulse" style={{ filter: "hue-rotate(-10deg) saturate(2)" }}>
          🦞
        </div>
        <div className="text-sm mt-4 font-mono tracking-[0.3em] uppercase animate-pulse" style={{ color: "#ff2222" }}>
          INITIALIZING...
        </div>
        <div className="mt-2 text-xs font-mono" style={{ color: "rgba(255, 34, 34, 0.3)" }}>
          ◆ CLAWD_FOMO3D ◆
        </div>
      </div>
    ),
  },
);

export const ClientProviders = ({ children }: { children: React.ReactNode }) => {
  return <ScaffoldEthAppWithProviders>{children}</ScaffoldEthAppWithProviders>;
};

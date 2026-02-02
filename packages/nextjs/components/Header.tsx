"use client";

import React from "react";
import Link from "next/link";
import { hardhat } from "viem/chains";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";

/**
 * Site header — Terminal Style
 */
export const Header = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;

  return (
    <div
      className="sticky lg:static top-0 z-20"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px",
        background: "rgba(26, 26, 30, 0.95)",
        borderBottom: "1px solid rgba(249, 115, 22, 0.4)",
        backdropFilter: "blur(12px)",
        gap: "8px",
        flexWrap: "nowrap",
      }}
    >
      <Link href="/" passHref className="shrink-0 group" style={{ textDecoration: "none" }}>
        <div className="flex flex-col">
          <span
            className="font-extrabold leading-tight text-[#f97316] tracking-wider font-mono"
            style={{ fontSize: "clamp(12px, 3.5vw, 18px)" }}
          >
            ◆ ClawFomo
            <span className="text-[#f97316]/50" style={{ fontSize: "0.75em" }}>
              .com
            </span>
          </span>
          <span
            className="text-[#f97316]/70 font-mono uppercase hidden sm:block"
            style={{ fontSize: "10px", letterSpacing: "0.3em" }}
          >
            last_buyer_wins_the_pot
          </span>
        </div>
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        <RainbowKitCustomConnectButton />
        {isLocalNetwork && <FaucetButton />}
      </div>
    </div>
  );
};

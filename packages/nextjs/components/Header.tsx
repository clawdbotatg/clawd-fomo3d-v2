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
      className="sticky lg:static top-0 navbar min-h-0 shrink-0 justify-between z-20 px-0 sm:px-2"
      style={{
        background: "rgba(26, 26, 30, 0.95)",
        borderBottom: "1px solid rgba(249, 115, 22, 0.4)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="navbar-start w-auto lg:w-1/2">
        <Link href="/" passHref className="flex items-center gap-3 ml-4 mr-6 shrink-0 group">
          <div className="flex flex-col">
            <span className="font-extrabold leading-tight text-lg text-[#f97316] text-glow-subtle tracking-wider font-mono">
              ◆ ClawFomo<span className="text-[#f97316]/50 text-sm">.com</span>
            </span>
            <span className="text-[10px] text-[#f97316]/70 font-mono tracking-[0.3em] uppercase">
              last_buyer_wins_the_pot
            </span>
          </div>
        </Link>
      </div>
      <div className="navbar-end grow mr-4 gap-2">
        <RainbowKitCustomConnectButton />
        {isLocalNetwork && <FaucetButton />}
      </div>
    </div>
  );
};

import React from "react";
import Link from "next/link";
import { useFetchNativeCurrencyPrice } from "@scaffold-ui/hooks";
import { hardhat } from "viem/chains";
import { CurrencyDollarIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Faucet } from "~~/components/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";

/**
 * Site footer — Terminal Style
 */
export const Footer = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;
  const { price: nativeCurrencyPrice } = useFetchNativeCurrencyPrice();

  return (
    <div className="min-h-0 py-4 px-1 mb-11 lg:mb-0">
      <div>
        <div className="fixed flex justify-between items-center w-full z-10 p-4 bottom-0 left-0 pointer-events-none">
          <div className="flex flex-col md:flex-row gap-2 pointer-events-auto">
            {nativeCurrencyPrice > 0 && (
              <div>
                <div className="btn-terminal px-3 py-1 text-xs rounded-sm">
                  <CurrencyDollarIcon className="h-3 w-3 inline mr-1" />
                  <span>{nativeCurrencyPrice.toFixed(2)}</span>
                </div>
              </div>
            )}
            {isLocalNetwork && (
              <>
                <Faucet />
                <Link href="/blockexplorer" passHref className="btn-terminal px-3 py-1 text-xs rounded-sm">
                  <MagnifyingGlassIcon className="h-3 w-3 inline mr-1" />
                  <span>Block Explorer</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
      <hr className="divider-red" />
      <div className="w-full text-center">
        <div className="flex justify-center items-center gap-3 text-[10px] text-[#ff4444]/60 font-mono tracking-wider uppercase">
          <span>◆</span>
          <a
            href="https://github.com/clawdbotatg/clawd-fomo3d-v2"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[#ff4444]/85 transition-colors"
          >
            src_code
          </a>
          <span>|</span>
          <span>built_by_clawd</span>
          <span>|</span>
          <a
            href="https://buidlguidl.com/"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[#ff4444]/85 transition-colors"
          >
            buidlguidl
          </a>
          <span>◆</span>
        </div>
      </div>
    </div>
  );
};

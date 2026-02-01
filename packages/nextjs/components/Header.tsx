"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hardhat } from "viem/chains";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick, useTargetNetwork } from "~~/hooks/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

export const menuLinks: HeaderMenuLink[] = [
  {
    label: "[ GAME ]",
    href: "/",
  },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks.map(({ label, href, icon }) => {
        const isActive = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              passHref
              className={`${
                isActive ? "text-[#ff4444] text-glow-subtle" : "text-[#ff6666]"
              } hover:text-[#ff4444] hover:text-glow-subtle py-1.5 px-3 text-sm font-mono font-bold tracking-wider uppercase transition-all`}
            >
              {icon}
              <span>{label}</span>
            </Link>
          </li>
        );
      })}
    </>
  );
};

/**
 * Site header — Terminal Style
 */
export const Header = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;

  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  return (
    <div
      className="sticky lg:static top-0 navbar min-h-0 shrink-0 justify-between z-20 px-0 sm:px-2"
      style={{
        background: "rgba(26, 26, 30, 0.95)",
        borderBottom: "1px solid rgba(255, 68, 68, 0.4)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="navbar-start w-auto lg:w-1/2">
        <details className="dropdown" ref={burgerMenuRef}>
          <summary className="ml-1 btn btn-ghost lg:hidden hover:bg-transparent">
            <Bars3Icon className="h-1/2 text-[#ff4444]" />
          </summary>
          <ul
            className="menu menu-compact dropdown-content mt-3 p-2 shadow-sm rounded-sm w-52"
            style={{ background: "#222228", border: "1px solid rgba(255, 68, 68, 0.45)" }}
            onClick={() => {
              burgerMenuRef?.current?.removeAttribute("open");
            }}
          >
            <HeaderMenuLinks />
          </ul>
        </details>
        <Link href="/" passHref className="hidden lg:flex items-center gap-3 ml-4 mr-6 shrink-0 group">
          <div className="flex flex-col">
            <span className="font-extrabold leading-tight text-lg text-[#ff4444] text-glow-subtle tracking-wider font-mono">
              ◆ ClawFomo<span className="text-[#ff4444]/50 text-sm">.com</span>
            </span>
            <span className="text-[10px] text-[#ff4444]/70 font-mono tracking-[0.3em] uppercase">
              last_buyer_wins_the_pot
            </span>
          </div>
        </Link>
        <ul className="hidden lg:flex lg:flex-nowrap menu menu-horizontal px-1 gap-2">
          <HeaderMenuLinks />
        </ul>
      </div>
      <div className="navbar-end grow mr-4 gap-2">
        <RainbowKitCustomConnectButton />
        {isLocalNetwork && <FaucetButton />}
      </div>
    </div>
  );
};

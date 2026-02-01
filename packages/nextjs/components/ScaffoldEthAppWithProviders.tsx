"use client";

import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { Toaster } from "react-hot-toast";
import { WagmiProvider } from "wagmi";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <div className="flex flex-col min-h-screen scanlines" style={{ background: "#0a0a0a" }}>
        {/* Terminal grid background */}
        <div className="terminal-grid" />
        <Header />
        <main className="relative flex flex-col flex-1 z-[1]">{children}</main>
        <Footer />
      </div>
      <Toaster
        toastOptions={{
          style: {
            background: "#111",
            color: "#ff2222",
            border: "1px solid rgba(255, 34, 34, 0.3)",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.85rem",
          },
        }}
      />
    </>
  );
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export const ScaffoldEthAppWithProviders = ({ children }: { children: React.ReactNode }) => {
  const redDarkTheme = darkTheme({
    accentColor: "#ff2222",
    accentColorForeground: "#0a0a0a",
    borderRadius: "small",
    fontStack: "system",
  });

  // Override RainbowKit modal backgrounds
  redDarkTheme.colors.modalBackground = "#111111";
  redDarkTheme.colors.profileForeground = "#111111";
  redDarkTheme.colors.connectButtonBackground = "#111111";

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider avatar={BlockieAvatar} theme={redDarkTheme}>
          <ProgressBar height="2px" color="#ff2222" />
          <ScaffoldEthApp>{children}</ScaffoldEthApp>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

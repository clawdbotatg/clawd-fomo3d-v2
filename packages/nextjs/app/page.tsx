"use client";

import { useEffect, useRef, useState } from "react";
import { Address } from "@scaffold-ui/components";
import { formatEther, maxUint256 } from "viem";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { useLobsterConfetti } from "~~/components/LobsterConfetti";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const CLAWD_TOKEN = "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07";
const FOMO3D_ADDRESS = "0xC0b703b935Add62fC7B60beb3B7e345b79603B8B";
const TARGET_CHAIN_ID = 8453;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

export default function Home() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { trigger: triggerConfetti } = useLobsterConfetti();
  const buyBtnRef = useRef<HTMLButtonElement>(null);

  const [numKeys, setNumKeys] = useState("1");
  const [isSwitching, setIsSwitching] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isBuying, setIsBuying] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [claimingRound, setClaimingRound] = useState<number | null>(null);
  const [clawdPrice, setClawdPrice] = useState(0);
  const [countdown, setCountdown] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);

  // ============ Contract Reads ============

  const { data: roundInfo } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getRoundInfo",
  });

  const { data: totalBurned } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "totalBurned",
  });

  const keysNum = parseInt(numKeys) || 0;
  const { data: cost } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "calculateCost",
    args: [BigInt(keysNum > 0 ? keysNum : 1)],
  });

  const currentRound = roundInfo ? Number(roundInfo[0]) : 0;

  const { data: playerInfo } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getPlayer",
    args: [BigInt(currentRound || 1), address || ZERO_ADDR],
  });

  const { data: isPotCapReached } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "isPotCapReached",
  });

  const { data: clawdAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [address || ZERO_ADDR, FOMO3D_ADDRESS],
  });

  const { data: clawdBalance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "balanceOf",
    args: [address || ZERO_ADDR],
  });

  // ============ Contract Writes ============
  const { writeContractAsync: writeFomo } = useScaffoldWriteContract({ contractName: "ClawdFomo3D" });
  const { writeContractAsync: writeClawd } = useScaffoldWriteContract({ contractName: "CLAWD" });

  // ============ Round History ============
  const [roundHistory, setRoundHistory] = useState<
    Array<{
      round: number;
      winner: string;
      potSize: bigint;
      winnerPayout: bigint;
      burned: bigint;
      totalKeys: bigint;
      endTime: bigint;
      playerKeys: bigint;
      playerPending: bigint;
      playerWithdrawn: bigint;
    }>
  >([]);

  const { data: prevPlayerInfo } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getPlayer",
    args: [BigInt(currentRound > 1 ? currentRound - 1 : 1), address || ZERO_ADDR],
  });

  const { data: round1Result } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getRoundResult",
    args: [1n],
  });
  const { data: round2Result } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getRoundResult",
    args: [2n],
  });
  const { data: round3Result } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getRoundResult",
    args: [3n],
  });
  const { data: round4Result } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getRoundResult",
    args: [4n],
  });
  const { data: round5Result } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getRoundResult",
    args: [5n],
  });

  const { data: round1Player } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getPlayer",
    args: [1n, address || ZERO_ADDR],
  });
  const { data: round2Player } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getPlayer",
    args: [2n, address || ZERO_ADDR],
  });
  const { data: round3Player } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getPlayer",
    args: [3n, address || ZERO_ADDR],
  });
  const { data: round4Player } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getPlayer",
    args: [4n, address || ZERO_ADDR],
  });
  const { data: round5Player } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getPlayer",
    args: [5n, address || ZERO_ADDR],
  });

  useEffect(() => {
    if (!currentRound) return;
    const results = [
      { round: 1, result: round1Result, player: round1Player },
      { round: 2, result: round2Result, player: round2Player },
      { round: 3, result: round3Result, player: round3Player },
      { round: 4, result: round4Result, player: round4Player },
      { round: 5, result: round5Result, player: round5Player },
    ];

    const history = results
      .filter(r => r.round < currentRound && r.result && r.result.winner !== ZERO_ADDR)
      .map(r => ({
        round: r.round,
        winner: r.result!.winner,
        potSize: r.result!.potSize,
        winnerPayout: r.result!.winnerPayout,
        burned: r.result!.burned,
        totalKeys: r.result!.totalKeys,
        endTime: r.result!.endTime,
        playerKeys: r.player ? r.player[0] : 0n,
        playerPending: r.player ? r.player[1] : 0n,
        playerWithdrawn: r.player ? r.player[2] : 0n,
      }))
      .reverse();

    setRoundHistory(history);
  }, [
    currentRound,
    round1Result,
    round2Result,
    round3Result,
    round4Result,
    round5Result,
    round1Player,
    round2Player,
    round3Player,
    round4Player,
    round5Player,
  ]);

  // ============ CLAWD Price ============
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${CLAWD_TOKEN}`);
        const data = await res.json();
        if (data.pairs && data.pairs.length > 0) {
          setClawdPrice(parseFloat(data.pairs[0].priceUsd || "0"));
        }
      } catch {
        /* silently fail */
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 30000);
    return () => clearInterval(interval);
  }, []);

  // ============ Countdown Timer ============
  useEffect(() => {
    if (!roundInfo) return;
    const endTime = Number(roundInfo[2]);

    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = endTime - now;
      setTimeLeft(diff);
      if (diff <= 0) {
        setCountdown("00:00:00");
        return;
      }
      const d = Math.floor(diff / 86400);
      const h = Math.floor((diff % 86400) / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      if (d > 0) {
        setCountdown(
          `${d}d ${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`,
        );
      } else {
        setCountdown(
          `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`,
        );
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [roundInfo]);

  // ============ Formatters ============
  const formatClawd = (val: bigint | undefined) => {
    if (!val) return "0";
    return Number(formatEther(val)).toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const formatClawdPrecise = (val: bigint | undefined) => {
    if (!val) return "0";
    return Number(formatEther(val)).toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const toUsd = (val: bigint | undefined) => {
    if (!val || !clawdPrice) return "$0.00";
    const amount = Number(formatEther(val));
    const usd = amount * clawdPrice;
    if (usd < 0.01) return "<$0.01";
    return `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // ============ Confetti helper ============
  const fireConfetti = (e?: React.MouseEvent) => {
    if (e) {
      triggerConfetti(e.clientX, e.clientY);
    } else if (buyBtnRef.current) {
      const rect = buyBtnRef.current.getBoundingClientRect();
      triggerConfetti(rect.left + rect.width / 2, rect.top);
    } else {
      triggerConfetti();
    }
  };

  // ============ Handlers ============
  const handleSwitch = async () => {
    setIsSwitching(true);
    try {
      await switchChain({ chainId: TARGET_CHAIN_ID });
    } catch (e) {
      console.error(e);
      notification.error("Failed to switch network");
    } finally {
      setIsSwitching(false);
    }
  };

  const handleApprove = async (e: React.MouseEvent) => {
    setIsApproving(true);
    try {
      await writeClawd({
        functionName: "approve",
        args: [FOMO3D_ADDRESS, maxUint256],
      });
      notification.success("CLAWD approved! ✅");
      fireConfetti(e);
    } catch (err: any) {
      console.error(err);
      if (err?.message?.includes("user rejected")) {
        notification.error("Transaction rejected");
      } else {
        notification.error("Approval failed");
      }
    } finally {
      setIsApproving(false);
    }
  };

  const handleBuy = async (e: React.MouseEvent) => {
    if (keysNum <= 0 || keysNum > 1000) {
      notification.error("Enter 1-1000 keys");
      return;
    }
    setIsBuying(true);
    try {
      await writeFomo({
        functionName: "buyKeys",
        args: [BigInt(keysNum)],
      });
      notification.success(`Bought ${keysNum} key${keysNum > 1 ? "s" : ""}! 🦞🔑`);
      fireConfetti(e);
    } catch (err: any) {
      console.error(err);
      if (err?.message?.includes("user rejected")) {
        notification.error("Transaction rejected");
      } else {
        notification.error("Buy failed — check your CLAWD balance");
      }
    } finally {
      setIsBuying(false);
    }
  };

  const handleEndRound = async () => {
    setIsEnding(true);
    try {
      await writeFomo({ functionName: "endRound" });
      notification.success("Round ended! 🎉");
      triggerConfetti();
    } catch (err: any) {
      console.error(err);
      if (err?.message?.includes("Grace period")) {
        notification.error("Grace period — only last buyer can end right now");
      } else {
        notification.error("End round failed");
      }
    } finally {
      setIsEnding(false);
    }
  };

  const handleClaim = async (round: number) => {
    setClaimingRound(round);
    try {
      await writeFomo({
        functionName: "claimDividends",
        args: [BigInt(round)],
      });
      notification.success(`Dividends claimed for Round ${round}! 💰`);
      triggerConfetti();
    } catch (err: any) {
      console.error(err);
      notification.error("No dividends to claim");
    } finally {
      setClaimingRound(null);
    }
  };

  // ============ Derived State ============
  const isRoundActive = roundInfo ? Boolean(roundInfo[6]) : false;
  const wrongNetwork = chainId !== TARGET_CHAIN_ID;
  const needsApproval = cost && clawdAllowance !== undefined && clawdAllowance < cost;
  const isAntiSnipe = timeLeft > 0 && timeLeft <= 120;
  const isUrgent = timeLeft > 0 && timeLeft <= 600;

  // ============ Buy Button ============
  const renderBuyButton = () => {
    if (wrongNetwork) {
      return (
        <button
          className="w-full py-4 px-6 rounded-2xl font-black text-lg tracking-wide transition-all duration-200
                     bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/25
                     disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isSwitching}
          onClick={handleSwitch}
        >
          {isSwitching ? (
            <span className="flex items-center justify-center gap-2">
              <span className="loading loading-spinner loading-sm"></span> Switching...
            </span>
          ) : (
            "⛓️ Switch to Base"
          )}
        </button>
      );
    }

    if (needsApproval) {
      return (
        <button
          className="w-full py-4 px-6 rounded-2xl font-black text-lg tracking-wide transition-all duration-200
                     bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                     text-white shadow-lg shadow-emerald-500/25
                     disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isApproving}
          onClick={handleApprove}
        >
          {isApproving ? (
            <span className="flex items-center justify-center gap-2">
              <span className="loading loading-spinner loading-sm"></span> Approving...
            </span>
          ) : (
            "✅ Approve CLAWD"
          )}
        </button>
      );
    }

    return (
      <button
        ref={buyBtnRef}
        className={`w-full py-4 px-6 rounded-2xl font-black text-xl tracking-wide transition-all duration-200
                   bg-gradient-to-r from-red-500 via-orange-500 to-amber-500
                   hover:from-red-400 hover:via-orange-400 hover:to-amber-400
                   text-white shadow-lg shadow-orange-500/30
                   disabled:opacity-40 disabled:cursor-not-allowed
                   ${!isBuying && isRoundActive && !isPotCapReached ? "hover:scale-[1.02] active:scale-95" : ""}`}
        disabled={isBuying || !isRoundActive || Boolean(isPotCapReached)}
        onClick={handleBuy}
      >
        {isBuying ? (
          <span className="flex items-center justify-center gap-2">
            <span className="loading loading-spinner loading-sm"></span> Buying...
          </span>
        ) : isPotCapReached ? (
          "⛔ Pot Cap Reached"
        ) : !isRoundActive ? (
          "⏰ Round Ended"
        ) : (
          `🦞 BUY ${keysNum || 1} KEY${keysNum > 1 ? "S" : ""}`
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0b14]">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative flex flex-col items-center gap-6 p-4 md:p-6 max-w-5xl mx-auto pb-20">
        {/* ============ HERO: Countdown Timer ============ */}
        <div
          className={`w-full rounded-3xl p-8 md:p-14 text-center relative overflow-hidden transition-all duration-500 ${
            !isRoundActive
              ? "bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700/50"
              : isAntiSnipe
                ? "bg-gradient-to-br from-red-950 via-red-900 to-orange-950 border-2 border-red-500/70"
                : "bg-gradient-to-br from-[#1a0a2e] via-[#16082a] to-[#0d1117] border border-purple-500/20"
          }`}
        >
          {/* Glow effect */}
          {isRoundActive && <div className={`absolute inset-0 ${isAntiSnipe ? "bg-red-500/5" : "bg-purple-500/5"}`} />}

          {/* Floating background emojis */}
          <div className="absolute inset-0 overflow-hidden opacity-[0.07]">
            <div className="absolute top-6 left-[10%] text-6xl animate-float-slow">🦞</div>
            <div className="absolute top-12 right-[15%] text-4xl animate-float-delayed">🔑</div>
            <div className="absolute bottom-8 left-[20%] text-5xl animate-float-slow">💰</div>
            <div className="absolute bottom-4 right-[10%] text-6xl animate-float-delayed">👑</div>
          </div>

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6">
              <div
                className={`w-2 h-2 rounded-full ${isRoundActive ? (isAntiSnipe ? "bg-red-400 animate-pulse" : "bg-emerald-400") : "bg-gray-500"}`}
              />
              <span className="text-xs md:text-sm uppercase tracking-[0.25em] text-white/60 font-medium">
                Round {currentRound || "—"} {isAntiSnipe && "• ⚡ ANTI-SNIPE"}
              </span>
            </div>

            <div
              className={`text-7xl md:text-[10rem] font-mono font-black tracking-tight leading-none mb-6 ${
                !isRoundActive
                  ? "text-gray-500"
                  : isAntiSnipe
                    ? "text-red-400 animate-pulse"
                    : isUrgent
                      ? "text-amber-300"
                      : "text-white"
              }`}
              style={{
                textShadow: isAntiSnipe
                  ? "0 0 60px rgba(239,68,68,0.4), 0 0 120px rgba(239,68,68,0.2)"
                  : isRoundActive
                    ? "0 0 60px rgba(255,255,255,0.15), 0 0 120px rgba(139,92,246,0.1)"
                    : "none",
              }}
            >
              {countdown || "--:--:--"}
            </div>

            <p className="text-base md:text-lg text-white/40 max-w-md mx-auto">
              {isRoundActive
                ? isAntiSnipe
                  ? "🚨 Under 2 minutes! Every buy extends the timer!"
                  : "Last buyer when the timer hits zero wins the pot"
                : "🏆 Round has ended — someone claim the prize!"}
            </p>
          </div>
        </div>

        {/* ============ Stats Grid ============ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 w-full">
          {[
            {
              label: "Pot Size",
              icon: "🏆",
              value: roundInfo ? formatClawd(roundInfo[1]) : "—",
              sub: roundInfo ? `${toUsd(roundInfo[1])}` : "",
              accent: "text-emerald-400",
              extra:
                roundInfo && roundInfo[7] > 0n
                  ? `Cap: ${formatClawd(roundInfo[7])} ${isPotCapReached ? "⛔" : ""}`
                  : null,
            },
            {
              label: "Key Price",
              icon: "🔑",
              value: roundInfo ? formatClawd(roundInfo[5]) : "—",
              sub: roundInfo ? `${toUsd(roundInfo[5])}` : "",
              accent: "text-amber-400",
            },
            {
              label: "Keys Sold",
              icon: "🎲",
              value: roundInfo ? Number(roundInfo[4]).toLocaleString() : "—",
              sub: "this round",
              accent: "text-blue-400",
            },
            {
              label: "Total Burned",
              icon: "🔥",
              value: totalBurned !== undefined ? formatClawd(totalBurned) : "—",
              sub: totalBurned !== undefined ? toUsd(totalBurned) : "",
              accent: "text-red-400",
            },
          ].map(stat => (
            <div
              key={stat.label}
              className="bg-[#12131f] rounded-2xl p-4 md:p-5 text-center border border-white/5
                         hover:border-white/10 transition-all duration-200"
            >
              <div className="text-xs text-white/30 uppercase tracking-wider mb-2 font-medium">
                {stat.icon} {stat.label}
              </div>
              <div className={`text-2xl md:text-3xl font-black ${stat.accent}`}>{stat.value}</div>
              <div className="text-xs text-white/25 mt-1">{stat.sub}</div>
              {stat.extra && <div className="text-xs text-amber-400/70 mt-1 font-medium">{stat.extra}</div>}
            </div>
          ))}
        </div>

        {/* ============ Last Buyer (Leader) ============ */}
        <div className="w-full bg-gradient-to-r from-amber-500/5 to-orange-500/5 rounded-2xl p-5 text-center border border-amber-500/10">
          <div className="text-xs text-amber-300/50 uppercase tracking-wider mb-2 font-medium">👑 Current Leader</div>
          {roundInfo && roundInfo[3] && roundInfo[3] !== ZERO_ADDR ? (
            <div className="flex justify-center">
              <Address address={roundInfo[3]} />
            </div>
          ) : (
            <span className="text-white/20 text-lg">No buyers yet — be the first! 🏃</span>
          )}
        </div>

        {/* ============ BUY KEYS Section ============ */}
        <div className="bg-[#12131f] rounded-3xl p-6 md:p-8 w-full border border-white/5 relative overflow-hidden">
          {/* Subtle gradient accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500 opacity-60" />

          <div className="flex flex-col md:flex-row gap-6">
            {/* Left: Input */}
            <div className="flex-1">
              <label className="text-sm text-white/40 mb-3 block font-medium">How many keys?</label>
              <input
                type="number"
                min="1"
                max="1000"
                value={numKeys}
                onChange={e => setNumKeys(e.target.value)}
                className="w-full bg-[#1a1b2e] border border-white/10 rounded-xl px-4 py-3
                           text-center text-3xl font-black text-white
                           focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20
                           transition-all"
                placeholder="1"
              />

              {/* Quick buttons */}
              <div className="flex gap-2 mt-3">
                {[1, 5, 10, 25, 50, 100].map(n => (
                  <button
                    key={n}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all duration-150 ${
                      numKeys === String(n)
                        ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                        : "bg-white/5 text-white/40 border border-transparent hover:bg-white/10 hover:text-white/60"
                    }`}
                    onClick={() => setNumKeys(String(n))}
                  >
                    {n}
                  </button>
                ))}
              </div>

              {cost && (
                <div className="mt-4 p-4 bg-[#1a1b2e] rounded-xl border border-white/5">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-white/30">Total Cost</span>
                    <span className="text-sm text-white/30">{toUsd(cost)}</span>
                  </div>
                  <div className="text-2xl font-black text-white mt-1">
                    {formatClawdPrecise(cost)} <span className="text-white/30 text-base">CLAWD</span>
                  </div>
                  <div className="text-xs text-red-400/60 mt-2 flex items-center gap-1">
                    🔥 {formatClawd((cost * 10n) / 100n)} burned on buy (10%)
                  </div>
                </div>
              )}

              {address && clawdBalance !== undefined && (
                <div className="text-xs text-white/20 mt-3">
                  Balance: {formatClawd(clawdBalance)} CLAWD ({toUsd(clawdBalance)})
                </div>
              )}
            </div>

            {/* Right: Buy Button */}
            <div className="flex flex-col justify-center md:w-72 gap-3">
              {renderBuyButton()}

              {needsApproval && (
                <p className="text-xs text-white/20 text-center">
                  One-time approval to let the contract spend your CLAWD
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ============ Your Stats + Dividends ============ */}
        {address && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
            <div className="bg-[#12131f] rounded-2xl p-5 border border-white/5">
              <div className="text-sm font-bold mb-4 text-white/70">🎮 Your Round {currentRound} Stats</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-white/25 mb-1">Keys</div>
                  <div className="text-2xl font-black text-white">
                    {playerInfo ? Number(playerInfo[0]).toLocaleString() : "0"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-white/25 mb-1">Pending</div>
                  <div className="text-2xl font-black text-emerald-400">
                    {playerInfo ? formatClawd(playerInfo[1]) : "0"}
                  </div>
                  <div className="text-xs text-white/20">{playerInfo ? toUsd(playerInfo[1]) : ""}</div>
                </div>
                <div>
                  <div className="text-xs text-white/25 mb-1">Claimed</div>
                  <div className="text-2xl font-black text-white/60">
                    {playerInfo ? formatClawd(playerInfo[2]) : "0"}
                  </div>
                  <div className="text-xs text-white/20">{playerInfo ? toUsd(playerInfo[2]) : ""}</div>
                </div>
              </div>
              {playerInfo && playerInfo[1] > 0n && (
                <button
                  className="w-full mt-4 py-2.5 rounded-xl font-bold text-sm bg-emerald-500/15 text-emerald-400
                             border border-emerald-500/20 hover:bg-emerald-500/25 transition-all
                             disabled:opacity-50"
                  disabled={claimingRound === currentRound}
                  onClick={() => handleClaim(currentRound)}
                >
                  {claimingRound === currentRound ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="loading loading-spinner loading-sm"></span> Claiming...
                    </span>
                  ) : (
                    `💰 Claim ${formatClawd(playerInfo[1])} CLAWD`
                  )}
                </button>
              )}
            </div>

            {currentRound > 1 && prevPlayerInfo && prevPlayerInfo[0] > 0n && (
              <div className="bg-[#12131f] rounded-2xl p-5 border border-white/5">
                <div className="text-sm font-bold mb-4 text-white/70">📜 Round {currentRound - 1} Dividends</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-white/25 mb-1">Keys</div>
                    <div className="text-2xl font-black text-white">{Number(prevPlayerInfo[0]).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/25 mb-1">Pending</div>
                    <div className="text-2xl font-black text-emerald-400">{formatClawd(prevPlayerInfo[1])}</div>
                    <div className="text-xs text-white/20">{toUsd(prevPlayerInfo[1])}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/25 mb-1">Claimed</div>
                    <div className="text-2xl font-black text-white/60">{formatClawd(prevPlayerInfo[2])}</div>
                  </div>
                </div>
                {prevPlayerInfo[1] > 0n && (
                  <button
                    className="w-full mt-4 py-2.5 rounded-xl font-bold text-sm bg-emerald-500/15 text-emerald-400
                               border border-emerald-500/20 hover:bg-emerald-500/25 transition-all
                               disabled:opacity-50"
                    disabled={claimingRound === currentRound - 1}
                    onClick={() => handleClaim(currentRound - 1)}
                  >
                    {claimingRound === currentRound - 1 ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="loading loading-spinner loading-sm"></span> Claiming...
                      </span>
                    ) : (
                      `💰 Claim ${formatClawd(prevPlayerInfo[1])} CLAWD`
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ============ End Round Button ============ */}
        {!isRoundActive && (
          <div className="w-full bg-gradient-to-r from-amber-500/5 to-red-500/5 rounded-2xl p-6 text-center border border-amber-500/15">
            <div className="text-xl font-black mb-2 text-white">🏁 Round Over!</div>
            <p className="text-sm text-white/30 mb-4 max-w-md mx-auto">
              Timer expired. End the round to distribute the pot. 60s grace period for last buyer, then anyone can call.
            </p>
            {wrongNetwork ? (
              <button
                className="py-3 px-8 rounded-xl font-bold bg-amber-500 text-black hover:bg-amber-400 transition-all
                           disabled:opacity-50"
                disabled={isSwitching}
                onClick={handleSwitch}
              >
                {isSwitching ? "Switching..." : "⛓️ Switch to Base"}
              </button>
            ) : (
              <button
                className="py-3 px-8 rounded-xl font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-black
                           hover:from-amber-400 hover:to-orange-400 transition-all
                           disabled:opacity-50"
                disabled={isEnding}
                onClick={handleEndRound}
              >
                {isEnding ? (
                  <span className="flex items-center gap-2">
                    <span className="loading loading-spinner loading-sm"></span> Ending Round...
                  </span>
                ) : (
                  "🏁 End Round & Distribute Pot"
                )}
              </button>
            )}
          </div>
        )}

        {/* ============ Pot Distribution ============ */}
        <div className="bg-[#12131f] rounded-2xl p-6 w-full border border-white/5">
          <div className="text-lg font-black mb-5 text-white/80">📊 Pot Distribution</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                pct: "40%",
                label: "Winner",
                icon: "🏆",
                desc: "Last buyer takes it",
                color: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/15 text-emerald-400",
              },
              {
                pct: "30%",
                label: "Burned",
                icon: "🔥",
                desc: "Gone forever",
                color: "from-red-500/20 to-red-500/5 border-red-500/15 text-red-400",
              },
              {
                pct: "25%",
                label: "Dividends",
                icon: "💰",
                desc: "To key holders",
                color: "from-blue-500/20 to-blue-500/5 border-blue-500/15 text-blue-400",
              },
              {
                pct: "5%",
                label: "Next Round",
                icon: "🌱",
                desc: "Seeds the pot",
                color: "from-amber-500/20 to-amber-500/5 border-amber-500/15 text-amber-400",
              },
            ].map(item => (
              <div key={item.label} className={`bg-gradient-to-b ${item.color} rounded-xl p-4 text-center border`}>
                <div className={`text-3xl font-black`}>{item.pct}</div>
                <div className="text-sm font-bold mt-1 text-white/70">
                  {item.icon} {item.label}
                </div>
                <div className="text-xs text-white/25 mt-1">{item.desc}</div>
              </div>
            ))}
          </div>
          <div className="text-xs text-white/15 mt-3 text-center">+ 10% of every key purchase is burned on buy</div>
        </div>

        {/* ============ Round History ============ */}
        {roundHistory.length > 0 && (
          <div className="bg-[#12131f] rounded-2xl p-6 w-full border border-white/5">
            <div className="text-lg font-black mb-4 text-white/80">📜 Round History</div>
            <div className="overflow-x-auto">
              <table className="table table-sm w-full">
                <thead>
                  <tr className="text-white/30 border-white/5">
                    <th>Round</th>
                    <th>Winner</th>
                    <th>Pot</th>
                    <th>Won</th>
                    <th>Burned</th>
                    <th>Keys</th>
                    {address && <th>Your Keys</th>}
                    {address && <th>Dividends</th>}
                  </tr>
                </thead>
                <tbody>
                  {roundHistory.map(r => (
                    <tr key={r.round} className="border-white/5">
                      <td className="font-bold text-white/70">#{r.round}</td>
                      <td>
                        <Address address={r.winner} />
                      </td>
                      <td>
                        <div className="text-white/70">{formatClawd(r.potSize)}</div>
                        <div className="text-xs text-white/25">{toUsd(r.potSize)}</div>
                      </td>
                      <td>
                        <div className="text-emerald-400/80">{formatClawd(r.winnerPayout)}</div>
                        <div className="text-xs text-white/25">{toUsd(r.winnerPayout)}</div>
                      </td>
                      <td className="text-red-400/80">
                        <div>{formatClawd(r.burned)}</div>
                        <div className="text-xs text-white/25">{toUsd(r.burned)}</div>
                      </td>
                      <td className="text-white/50">{Number(r.totalKeys).toLocaleString()}</td>
                      {address && <td className="text-white/50">{Number(r.playerKeys).toLocaleString()}</td>}
                      {address && (
                        <td>
                          {r.playerPending > 0n ? (
                            <button
                              className="btn btn-success btn-xs"
                              disabled={claimingRound === r.round}
                              onClick={() => handleClaim(r.round)}
                            >
                              {claimingRound === r.round ? (
                                <span className="loading loading-spinner loading-xs"></span>
                              ) : (
                                `Claim ${formatClawd(r.playerPending)}`
                              )}
                            </button>
                          ) : r.playerWithdrawn > 0n ? (
                            <span className="text-emerald-400/60 text-xs">✅ {formatClawd(r.playerWithdrawn)}</span>
                          ) : r.playerKeys > 0n ? (
                            <span className="text-xs text-white/20">None</span>
                          ) : (
                            <span className="text-xs text-white/15">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============ How It Works ============ */}
        <div className="bg-[#12131f] rounded-2xl p-6 w-full border border-white/5">
          <div className="text-lg font-black mb-5 text-white/80">❓ How It Works</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: "🔑",
                title: "1. Buy Keys",
                desc: "Spend $CLAWD to buy keys. Price increases with each key sold (bonding curve). 10% burned on every buy.",
              },
              {
                icon: "⏰",
                title: "2. Reset Timer",
                desc: "Each purchase resets the countdown and makes you the leader. Anti-snipe extends timer if bought in last 2 min.",
              },
              {
                icon: "🏆",
                title: "3. Win the Pot",
                desc: "When timer expires, last buyer wins 40%! 30% burned, 25% to key holders as dividends, 5% seeds next round.",
              },
            ].map(step => (
              <div key={step.title} className="bg-white/[0.02] rounded-xl p-5 border border-white/5">
                <div className="text-3xl mb-3">{step.icon}</div>
                <div className="font-bold text-white/80 mb-2">{step.title}</div>
                <div className="text-sm text-white/30 leading-relaxed">{step.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ============ Footer ============ */}
        <div className="text-xs text-white/15 text-center space-y-1 pt-4">
          <div>$CLAWD: ${clawdPrice.toFixed(6)} USD</div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span>Contract:</span> <Address address={FOMO3D_ADDRESS} />
            <span>•</span>
            <span>Token:</span> <Address address={CLAWD_TOKEN} />
          </div>
        </div>
      </div>
    </div>
  );
}

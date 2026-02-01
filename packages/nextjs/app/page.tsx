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

/* ═══════════════════════════════════════════════════════
   TERMINAL HELPER — red diamond divider
   ═══════════════════════════════════════════════════════ */
const TermDivider = () => <hr className="divider-red my-5" />;

const TermLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[#ff2222]/30 text-xs font-mono uppercase tracking-[0.2em]">{children}</span>
);

const TermValue = ({ children, glow }: { children: React.ReactNode; glow?: boolean }) => (
  <span className={`text-[#ff2222] font-mono font-bold ${glow ? "text-glow" : ""}`}>{children}</span>
);

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
        if (data.pairs && data.pairs.length > 0) setClawdPrice(parseFloat(data.pairs[0].priceUsd || "0"));
      } catch {
        /* silent */
      }
    };
    fetchPrice();
    const iv = setInterval(fetchPrice, 30000);
    return () => clearInterval(iv);
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
      const pad = (n: number) => n.toString().padStart(2, "0");
      setCountdown(d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [roundInfo]);

  // ============ Formatters ============
  const fmtC = (val: bigint | undefined) => {
    if (!val) return "0";
    return Number(formatEther(val)).toLocaleString(undefined, { maximumFractionDigits: 0 });
  };
  const fmtCP = (val: bigint | undefined) => {
    if (!val) return "0";
    return Number(formatEther(val)).toLocaleString(undefined, { maximumFractionDigits: 2 });
  };
  const toUsd = (val: bigint | undefined) => {
    if (!val || !clawdPrice) return "$0.00";
    const usd = Number(formatEther(val)) * clawdPrice;
    if (usd < 0.01) return "<$0.01";
    return `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // ============ Confetti ============
  const fireConfetti = (e?: React.MouseEvent) => {
    if (e) triggerConfetti(e.clientX, e.clientY);
    else if (buyBtnRef.current) {
      const r = buyBtnRef.current.getBoundingClientRect();
      triggerConfetti(r.left + r.width / 2, r.top);
    } else triggerConfetti();
  };

  // ============ Handlers ============
  const handleSwitch = async () => {
    setIsSwitching(true);
    try {
      await switchChain({ chainId: TARGET_CHAIN_ID });
    } catch {
      notification.error("Failed to switch network");
    } finally {
      setIsSwitching(false);
    }
  };

  const handleApprove = async (e: React.MouseEvent) => {
    setIsApproving(true);
    try {
      await writeClawd({ functionName: "approve", args: [FOMO3D_ADDRESS, maxUint256] });
      notification.success("CLAWD APPROVED ✅");
      fireConfetti(e);
    } catch (err: any) {
      notification.error(err?.message?.includes("user rejected") ? "TX REJECTED" : "APPROVAL FAILED");
    } finally {
      setIsApproving(false);
    }
  };

  const handleBuy = async (e: React.MouseEvent) => {
    if (keysNum <= 0 || keysNum > 1000) {
      notification.error("ENTER 1-1000 KEYS");
      return;
    }
    setIsBuying(true);
    try {
      await writeFomo({ functionName: "buyKeys", args: [BigInt(keysNum)] });
      notification.success(`ACQUIRED ${keysNum} KEY${keysNum > 1 ? "S" : ""} 🦞`);
      fireConfetti(e);
    } catch (err: any) {
      notification.error(err?.message?.includes("user rejected") ? "TX REJECTED" : "BUY FAILED");
    } finally {
      setIsBuying(false);
    }
  };

  const handleEndRound = async () => {
    setIsEnding(true);
    try {
      await writeFomo({ functionName: "endRound" });
      notification.success("ROUND TERMINATED");
      triggerConfetti();
    } catch (err: any) {
      notification.error(err?.message?.includes("Grace period") ? "GRACE PERIOD ACTIVE" : "END ROUND FAILED");
    } finally {
      setIsEnding(false);
    }
  };

  const handleClaim = async (round: number) => {
    setClaimingRound(round);
    try {
      await writeFomo({ functionName: "claimDividends", args: [BigInt(round)] });
      notification.success(`DIVIDENDS CLAIMED — ROUND ${round}`);
      triggerConfetti();
    } catch {
      notification.error("NOTHING TO CLAIM");
    } finally {
      setClaimingRound(null);
    }
  };

  // ============ Derived State ============
  const isRoundActive = roundInfo ? Boolean(roundInfo[6]) : false;
  const wrongNetwork = chainId !== TARGET_CHAIN_ID;
  const needsApproval = cost && clawdAllowance !== undefined && clawdAllowance < cost;
  const isAntiSnipe = timeLeft > 0 && timeLeft <= 120;

  // ============ RENDER ============
  return (
    <div className="relative z-[1] flex flex-col items-center gap-0 p-4 md:px-6 max-w-4xl mx-auto pb-16 font-mono">
      {/* ═══════════════════════════════════════
          HERO — COUNTDOWN TIMER
         ═══════════════════════════════════════ */}
      <div className="w-full terminal-box corner-diamonds p-6 md:p-10 text-center mt-4">
        <div className="text-[10px] tracking-[0.4em] uppercase text-[#ff2222]/30 mb-1">
          ◆ round {currentRound || "—"}{" "}
          {isAntiSnipe ? "// ANTI-SNIPE ACTIVE" : isRoundActive ? "// ACTIVE" : "// ENDED"} ◆
        </div>

        <div
          className={`text-6xl md:text-[8rem] font-mono font-black tracking-tight leading-none my-4 md:my-6 ${
            isAntiSnipe ? "text-glow-intense animate-flicker" : isRoundActive ? "text-glow" : ""
          }`}
          style={{ color: isRoundActive ? "#ff2222" : "#ff2222aa" }}
        >
          {countdown || "--:--:--"}
        </div>

        <div className="text-xs text-[#ff2222]/30 tracking-wider">
          {isRoundActive
            ? isAntiSnipe
              ? "!! UNDER 2 MIN — EVERY BUY EXTENDS THE TIMER !!"
              : "- last buyer when timer hits zero wins the pot -"
            : "- round ended — execute endRound() to distribute -"}
        </div>

        {isAntiSnipe && (
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 border border-[#ff2222]/40 bg-[#ff2222]/5">
            <div className="w-2 h-2 bg-[#ff2222] animate-pulse-ring rounded-full" />
            <span className="text-[10px] text-[#ff2222] tracking-[0.3em] uppercase font-bold">ANTI-SNIPE</span>
          </div>
        )}
      </div>

      <TermDivider />

      {/* ═══════════════════════════════════════
          STATS — Terminal format
         ═══════════════════════════════════════ */}
      <div className="w-full terminal-box corner-diamonds p-5 md:p-6">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[#ff2222]/25 mb-4">◆ round_stats</div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-baseline">
            <TermLabel>- pot_size</TermLabel>
            <div className="text-right">
              <TermValue glow>{roundInfo ? fmtC(roundInfo[1]) : "—"} CLAWD</TermValue>
              <span className="text-[#ff2222]/20 text-xs ml-2">→ {roundInfo ? toUsd(roundInfo[1]) : ""}</span>
            </div>
          </div>

          <div className="flex justify-between items-baseline">
            <TermLabel>- key_price</TermLabel>
            <div className="text-right">
              <TermValue>{roundInfo ? fmtC(roundInfo[5]) : "—"} CLAWD</TermValue>
              <span className="text-[#ff2222]/20 text-xs ml-2">→ {roundInfo ? toUsd(roundInfo[5]) : ""}</span>
            </div>
          </div>

          <div className="flex justify-between items-baseline">
            <TermLabel>- keys_sold</TermLabel>
            <TermValue>{roundInfo ? Number(roundInfo[4]).toLocaleString() : "—"}</TermValue>
          </div>

          <div className="flex justify-between items-baseline">
            <TermLabel>- total_burned</TermLabel>
            <div className="text-right">
              <TermValue>{totalBurned !== undefined ? fmtC(totalBurned) : "—"} CLAWD</TermValue>
              <span className="text-[#ff2222]/20 text-xs ml-2">
                → {totalBurned !== undefined ? toUsd(totalBurned) : ""}
              </span>
            </div>
          </div>

          {roundInfo && roundInfo[7] > 0n && (
            <div className="flex justify-between items-baseline">
              <TermLabel>- pot_cap</TermLabel>
              <TermValue>
                {fmtC(roundInfo[7])} CLAWD {isPotCapReached ? "// REACHED" : ""}
              </TermValue>
            </div>
          )}
        </div>
      </div>

      <TermDivider />

      {/* ═══════════════════════════════════════
          CURRENT LEADER
         ═══════════════════════════════════════ */}
      <div className="w-full terminal-box p-4 text-center">
        <TermLabel>◆ current_leader</TermLabel>
        <div className="mt-2">
          {roundInfo && roundInfo[3] && roundInfo[3] !== ZERO_ADDR ? (
            <div className="flex justify-center">
              <Address address={roundInfo[3]} />
            </div>
          ) : (
            <span className="text-[#ff2222]/20 text-sm">NO BUYERS YET</span>
          )}
        </div>
      </div>

      <TermDivider />

      {/* ═══════════════════════════════════════
          BUY KEYS
         ═══════════════════════════════════════ */}
      <div className="w-full terminal-box corner-diamonds p-5 md:p-6">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[#ff2222]/25 mb-4">◆ buy_keys</div>

        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1">
            <div className="text-xs text-[#ff2222]/30 mb-2">quantity (1-1000):</div>
            <input
              type="number"
              min="1"
              max="1000"
              value={numKeys}
              onChange={e => setNumKeys(e.target.value)}
              className="w-full bg-transparent border border-[#ff2222]/20 px-4 py-3 text-center text-3xl font-bold text-[#ff2222] font-mono
                         focus:outline-none focus:border-[#ff2222]/50 transition-all"
              placeholder="1"
            />

            {/* Quick select */}
            <div className="flex gap-1 mt-3">
              {[1, 5, 10, 25, 50, 100].map(n => (
                <button
                  key={n}
                  className={`flex-1 py-1.5 text-xs font-mono font-bold tracking-wider transition-all border ${
                    numKeys === String(n)
                      ? "border-[#ff2222]/50 bg-[#ff2222]/10 text-[#ff2222]"
                      : "border-[#ff2222]/10 text-[#ff2222]/30 hover:border-[#ff2222]/30 hover:text-[#ff2222]/60"
                  }`}
                  onClick={() => setNumKeys(String(n))}
                >
                  {n}
                </button>
              ))}
            </div>

            {cost && (
              <div className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <TermLabel>- cost</TermLabel>
                  <div>
                    <TermValue>{fmtCP(cost)} CLAWD</TermValue>
                    <span className="text-[#ff2222]/20 text-xs ml-2">→ {toUsd(cost)}</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <TermLabel>- burn (10%)</TermLabel>
                  <span className="text-[#ff2222]/40 text-xs">{fmtC((cost * 10n) / 100n)} CLAWD</span>
                </div>
              </div>
            )}

            {address && clawdBalance !== undefined && (
              <div className="text-[10px] text-[#ff2222]/20 mt-3 tracking-wider">
                balance: {fmtC(clawdBalance)} CLAWD ({toUsd(clawdBalance)})
              </div>
            )}
          </div>

          {/* Action Button */}
          <div className="flex flex-col justify-center md:w-64 gap-3">
            {wrongNetwork ? (
              <button className="btn-terminal py-4 px-6 text-sm" disabled={isSwitching} onClick={handleSwitch}>
                {isSwitching ? "SWITCHING..." : ">> SWITCH TO BASE"}
              </button>
            ) : needsApproval ? (
              <button className="btn-terminal py-4 px-6 text-sm" disabled={isApproving} onClick={handleApprove}>
                {isApproving ? "APPROVING..." : ">> APPROVE CLAWD"}
              </button>
            ) : (
              <button
                ref={buyBtnRef}
                className={`btn-terminal py-4 px-6 text-lg ${
                  !isBuying && isRoundActive && !isPotCapReached ? "hover:scale-[1.02] active:scale-95" : ""
                }`}
                disabled={isBuying || !isRoundActive || Boolean(isPotCapReached)}
                onClick={handleBuy}
              >
                {isBuying
                  ? "EXECUTING..."
                  : isPotCapReached
                    ? "POT_CAP_REACHED"
                    : !isRoundActive
                      ? "ROUND_ENDED"
                      : `>> BUY ${keysNum || 1} KEY${keysNum > 1 ? "S" : ""}`}
              </button>
            )}

            {needsApproval && (
              <div className="text-[10px] text-[#ff2222]/15 text-center tracking-wider">one-time approval required</div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          YOUR STATS
         ═══════════════════════════════════════ */}
      {address && (
        <>
          <TermDivider />
          <div className="w-full terminal-box corner-diamonds p-5">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#ff2222]/25 mb-4">
              ◆ your_stats // round {currentRound}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <TermLabel>- your_keys</TermLabel>
                <TermValue>{playerInfo ? Number(playerInfo[0]).toLocaleString() : "0"}</TermValue>
              </div>
              <div className="flex justify-between">
                <TermLabel>- pending_divs</TermLabel>
                <div>
                  <TermValue glow>{playerInfo ? fmtC(playerInfo[1]) : "0"} CLAWD</TermValue>
                  <span className="text-[#ff2222]/20 text-xs ml-2">→ {playerInfo ? toUsd(playerInfo[1]) : ""}</span>
                </div>
              </div>
              <div className="flex justify-between">
                <TermLabel>- claimed</TermLabel>
                <span className="text-[#ff2222]/40">{playerInfo ? fmtC(playerInfo[2]) : "0"} CLAWD</span>
              </div>
            </div>

            {playerInfo && playerInfo[1] > 0n && (
              <button
                className="btn-terminal w-full mt-4 py-2.5 text-sm"
                disabled={claimingRound === currentRound}
                onClick={() => handleClaim(currentRound)}
              >
                {claimingRound === currentRound ? "CLAIMING..." : `>> CLAIM ${fmtC(playerInfo[1])} CLAWD`}
              </button>
            )}
          </div>

          {/* Previous round dividends */}
          {currentRound > 1 && prevPlayerInfo && prevPlayerInfo[0] > 0n && (
            <div className="w-full terminal-box p-5 mt-3">
              <div className="text-[10px] tracking-[0.3em] uppercase text-[#ff2222]/25 mb-4">
                ◆ dividends // round {currentRound - 1}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <TermLabel>- keys</TermLabel>
                  <TermValue>{Number(prevPlayerInfo[0]).toLocaleString()}</TermValue>
                </div>
                <div className="flex justify-between">
                  <TermLabel>- pending</TermLabel>
                  <TermValue glow>{fmtC(prevPlayerInfo[1])} CLAWD</TermValue>
                </div>
                <div className="flex justify-between">
                  <TermLabel>- claimed</TermLabel>
                  <span className="text-[#ff2222]/40">{fmtC(prevPlayerInfo[2])} CLAWD</span>
                </div>
              </div>
              {prevPlayerInfo[1] > 0n && (
                <button
                  className="btn-terminal w-full mt-4 py-2.5 text-sm"
                  disabled={claimingRound === currentRound - 1}
                  onClick={() => handleClaim(currentRound - 1)}
                >
                  {claimingRound === currentRound - 1 ? "CLAIMING..." : `>> CLAIM ${fmtC(prevPlayerInfo[1])} CLAWD`}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════
          END ROUND
         ═══════════════════════════════════════ */}
      {!isRoundActive && (
        <>
          <TermDivider />
          <div className="w-full terminal-box p-5 text-center">
            <div className="text-sm text-[#ff2222] font-bold mb-2 text-glow-subtle">!! ROUND TERMINATED !!</div>
            <div className="text-xs text-[#ff2222]/25 mb-4">
              60s grace for last buyer, then anyone can call endRound()
            </div>
            {wrongNetwork ? (
              <button className="btn-terminal py-2.5 px-8 text-sm" disabled={isSwitching} onClick={handleSwitch}>
                {isSwitching ? "SWITCHING..." : ">> SWITCH TO BASE"}
              </button>
            ) : (
              <button className="btn-terminal py-2.5 px-8 text-sm" disabled={isEnding} onClick={handleEndRound}>
                {isEnding ? "EXECUTING..." : ">> END_ROUND()"}
              </button>
            )}
          </div>
        </>
      )}

      <TermDivider />

      {/* ═══════════════════════════════════════
          POT DISTRIBUTION
         ═══════════════════════════════════════ */}
      <div className="w-full terminal-box corner-diamonds p-5">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[#ff2222]/25 mb-4">◆ pot_distribution</div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <TermLabel>- winner (last buyer)</TermLabel>
            <TermValue glow>40%</TermValue>
          </div>
          <div className="flex justify-between">
            <TermLabel>- burned (forever)</TermLabel>
            <TermValue>30%</TermValue>
          </div>
          <div className="flex justify-between">
            <TermLabel>- key_holder_divs</TermLabel>
            <TermValue>25%</TermValue>
          </div>
          <div className="flex justify-between">
            <TermLabel>- next_round_seed</TermLabel>
            <TermValue>5%</TermValue>
          </div>
        </div>
        <div className="text-[10px] text-[#ff2222]/15 mt-3 tracking-wider text-center">
          + 10% of every key purchase is burned on buy
        </div>
      </div>

      {/* ═══════════════════════════════════════
          ROUND HISTORY
         ═══════════════════════════════════════ */}
      {roundHistory.length > 0 && (
        <>
          <TermDivider />
          <div className="w-full terminal-box p-5">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#ff2222]/25 mb-4">◆ round_history</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-[#ff2222]/25 border-b border-[#ff2222]/10">
                    <th className="text-left py-2 pr-3">RND</th>
                    <th className="text-left py-2 pr-3">WINNER</th>
                    <th className="text-right py-2 pr-3">POT</th>
                    <th className="text-right py-2 pr-3">WON</th>
                    <th className="text-right py-2 pr-3">BURNED</th>
                    <th className="text-right py-2">KEYS</th>
                    {address && <th className="text-right py-2 pl-3">YOURS</th>}
                    {address && <th className="text-right py-2 pl-3">DIVS</th>}
                  </tr>
                </thead>
                <tbody>
                  {roundHistory.map(r => (
                    <tr key={r.round} className="border-b border-[#ff2222]/5 text-[#ff2222]/50">
                      <td className="py-2 pr-3 text-[#ff2222]/70">#{r.round}</td>
                      <td className="py-2 pr-3">
                        <Address address={r.winner} />
                      </td>
                      <td className="text-right py-2 pr-3">{fmtC(r.potSize)}</td>
                      <td className="text-right py-2 pr-3 text-[#ff2222]/70">{fmtC(r.winnerPayout)}</td>
                      <td className="text-right py-2 pr-3">{fmtC(r.burned)}</td>
                      <td className="text-right py-2">{Number(r.totalKeys).toLocaleString()}</td>
                      {address && <td className="text-right py-2 pl-3">{Number(r.playerKeys).toLocaleString()}</td>}
                      {address && (
                        <td className="text-right py-2 pl-3">
                          {r.playerPending > 0n ? (
                            <button
                              className="btn-terminal px-2 py-0.5 text-[10px]"
                              disabled={claimingRound === r.round}
                              onClick={() => handleClaim(r.round)}
                            >
                              {claimingRound === r.round ? "..." : `CLAIM ${fmtC(r.playerPending)}`}
                            </button>
                          ) : r.playerWithdrawn > 0n ? (
                            <span className="text-[#ff2222]/30">✓ {fmtC(r.playerWithdrawn)}</span>
                          ) : r.playerKeys > 0n ? (
                            <span className="text-[#ff2222]/15">none</span>
                          ) : (
                            <span className="text-[#ff2222]/10">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <TermDivider />

      {/* ═══════════════════════════════════════
          HOW IT WORKS
         ═══════════════════════════════════════ */}
      <div className="w-full terminal-box corner-diamonds p-5">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[#ff2222]/25 mb-4">◆ protocol</div>

        <div className="space-y-4 text-xs text-[#ff2222]/40">
          <div>
            <span className="text-[#ff2222]/60 font-bold">01.</span> buy_keys
            <div className="ml-4 mt-1">
              spend $CLAWD → acquire keys. price increases per key (bonding curve). 10% burned per buy.
            </div>
          </div>
          <div>
            <span className="text-[#ff2222]/60 font-bold">02.</span> reset_timer
            <div className="ml-4 mt-1">
              each purchase resets countdown → you become leader. anti-snipe extends timer if bought &lt;2min.
            </div>
          </div>
          <div>
            <span className="text-[#ff2222]/60 font-bold">03.</span> win_pot
            <div className="ml-4 mt-1">
              timer expires → last buyer wins 40%. 30% burned. 25% dividends to key holders. 5% seeds next round.
            </div>
          </div>
        </div>
      </div>

      <TermDivider />

      {/* ═══════════════════════════════════════
          FOOTER INFO
         ═══════════════════════════════════════ */}
      <div className="w-full text-center space-y-2 text-[10px] text-[#ff2222]/15 tracking-wider font-mono">
        <div>$CLAWD → ${clawdPrice.toFixed(6)} USD</div>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <span>contract:</span> <Address address={FOMO3D_ADDRESS} />
          <span>|</span>
          <span>token:</span> <Address address={CLAWD_TOKEN} />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Address } from "@scaffold-ui/components";
import { formatEther } from "viem";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { useLobsterConfetti } from "~~/components/LobsterConfetti";
import deployedContracts from "~~/contracts/deployedContracts";
import externalContracts from "~~/contracts/externalContracts";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

// Addresses from contract configs — never hardcode
const CLAWD_TOKEN = externalContracts[8453].CLAWD.address;
const FOMO3D_ADDRESS = deployedContracts[8453].ClawdFomo3D.address;
const TARGET_CHAIN_ID = 8453;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const POLL_MS = 3000;

/* ═══════════════════════════════════════════════════════
   ERROR DECODER — friendly messages for contract errors
   ═══════════════════════════════════════════════════════ */

// Known 4-byte error selectors → friendly messages
const ERROR_SELECTORS: Record<string, string> = {
  "0xe450d38c": "Not enough CLAWD! Buy some on Uniswap first. 🦞",
  "0xfb8f41b2": "Approval too low. Click Approve first.",
  "0x96c6fd1e": "Invalid sender address.",
  "0xec442f05": "Invalid receiver address.",
  "0xe602df05": "Invalid approver address.",
  "0x94280d62": "Invalid spender address.",
  "0xd93c0665": "Contract is paused.",
  "0x8dfc202b": "Contract is not paused.",
  "0x118cdaa7": "Not the contract owner.",
  "0x1e4fbdf7": "Invalid owner address.",
  "0x3ee5aeb5": "Reentrancy detected — try again.",
  "0xb7d09497": "Token operation failed.",
};

// Known error names (from decoded viem errors) → friendly messages
const ERROR_NAMES: Record<string, string> = {
  ERC20InsufficientBalance: "Not enough CLAWD! Buy some on Uniswap first. 🦞",
  ERC20InsufficientAllowance: "Approval too low. Click Approve first.",
  ERC20InvalidSender: "Invalid sender address.",
  ERC20InvalidReceiver: "Invalid receiver address.",
  ERC20InvalidApprover: "Invalid approver address.",
  ERC20InvalidSpender: "Invalid spender address.",
  EnforcedPause: "Contract is paused.",
  ExpectedPause: "Contract is not paused.",
  OwnableUnauthorizedAccount: "Not the contract owner.",
  OwnableInvalidOwner: "Invalid owner address.",
  ReentrancyGuardReentrantCall: "Reentrancy detected — try again.",
  SafeERC20FailedOperation: "Token operation failed.",
};

// Revert reason substrings → friendly messages
const REVERT_MESSAGES: Array<[string, string]> = [
  ["round not active", "Round has ended."],
  ["round is active", "Round is still active."],
  ["grace period", "Grace period active — wait 60s after timer expires."],
  ["no dividends", "Nothing to claim."],
  ["zero keys", "Buy at least 1 key."],
  ["too many keys", "Max 1000 keys per transaction."],
  ["insufficient", "Not enough CLAWD! Buy some on Uniswap first. 🦞"],
];

function decodeError(err: unknown): string {
  if (!err || typeof err !== "object") return "Something went wrong.";
  const e = err as Record<string, any>;

  // 1. User rejected / denied the transaction in wallet
  const msg = e.message || e.shortMessage || e.details || "";
  const msgLower = (typeof msg === "string" ? msg : String(msg)).toLowerCase();
  if (
    msgLower.includes("user rejected") ||
    msgLower.includes("user denied") ||
    msgLower.includes("rejected the request") ||
    msgLower.includes("user cancelled") ||
    msgLower.includes("user canceled")
  ) {
    return "Transaction cancelled.";
  }

  // 2. Check for decoded error name (viem ContractFunctionRevertedError)
  const walkError = e.walk ? e.walk() : (e.cause?.data ?? e.cause ?? e);
  const errorName = walkError?.errorName || e.data?.errorName || e.cause?.data?.errorName;
  if (errorName && ERROR_NAMES[errorName]) {
    return ERROR_NAMES[errorName];
  }

  // 3. Check for raw 4-byte selector in the error data
  const rawData = walkError?.data || e.data?.data || e.cause?.data?.data || "";
  if (typeof rawData === "string" && rawData.startsWith("0x") && rawData.length >= 10) {
    const selector = rawData.slice(0, 10).toLowerCase();
    if (ERROR_SELECTORS[selector]) {
      return ERROR_SELECTORS[selector];
    }
  }

  // 4. Check for generic revert string (0x08c379a0)
  if (typeof rawData === "string" && rawData.toLowerCase().startsWith("0x08c379a0") && rawData.length > 138) {
    try {
      const hex = rawData.slice(138);
      // Decode hex to UTF-8 without Buffer (browser-safe)
      const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
      const decoded = new TextDecoder().decode(bytes).replace(/\0/g, "").trim();
      if (decoded) return decoded;
    } catch {
      /* fall through */
    }
  }

  // 5. Search the full message string for known revert reasons
  const fullMsg = [msg, e.shortMessage, e.details, e.cause?.message, e.cause?.shortMessage]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const [pattern, friendly] of REVERT_MESSAGES) {
    if (fullMsg.includes(pattern)) return friendly;
  }

  // 6. Check for 4-byte selectors embedded in error message text
  const selectorMatch = fullMsg.match(/0x[a-f0-9]{8}/i);
  if (selectorMatch) {
    const sel = selectorMatch[0].toLowerCase();
    if (ERROR_SELECTORS[sel]) return ERROR_SELECTORS[sel];
  }

  // 7. Use viem's shortMessage if available (usually clean)
  if (e.shortMessage && typeof e.shortMessage === "string") {
    const short = e.shortMessage;
    // Strip overly technical viem prefixes
    const cleaned = short
      .replace(/^The contract function .* reverted with the following reason:\n?/i, "")
      .replace(/^ContractFunctionRevertedError: /i, "")
      .replace(/^execution reverted:?\s*/i, "")
      .trim();
    if (cleaned && cleaned.length < 200 && !cleaned.includes("0x")) {
      return cleaned;
    }
  }

  // 8. Last resort — generic message (never show raw hex)
  return "Transaction failed. Check your CLAWD balance and try again.";
}

/* ═══════════════════════════════════════════════════════
   HELPER COMPONENTS
   ═══════════════════════════════════════════════════════ */
const TermDivider = () => <hr className="divider-glow my-5" />;

const TermLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[#c9a0ff] text-xs font-mono uppercase tracking-[0.2em]">{children}</span>
);

const TermValue = ({ children, glow }: { children: React.ReactNode; glow?: boolean }) => (
  <span className={`text-[#f0e6ff] font-mono font-bold ${glow ? "text-glow" : ""}`}>{children}</span>
);

export default function Home() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { trigger: triggerConfetti } = useLobsterConfetti();
  const pageRef = useRef<HTMLDivElement>(null);
  const buyBtnRef = useRef<HTMLButtonElement>(null);

  const [numKeys, setNumKeys] = useState("1");
  const [isShaking, setIsShaking] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isBuying, setIsBuying] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [claimingRound, setClaimingRound] = useState<number | null>(null);
  const [clawdPrice, setClawdPrice] = useState(0);
  const [countdown, setCountdown] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  // ============ Contract Reads (all poll every 3s) ============
  const { data: roundInfo } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getRoundInfo",
    query: { refetchInterval: POLL_MS },
  });
  const { data: totalBurned } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "totalBurned",
    query: { refetchInterval: POLL_MS },
  });
  const keysNum = parseInt(numKeys) || 0;
  const { data: cost } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "calculateCost",
    args: [BigInt(keysNum > 0 ? keysNum : 1)],
    query: { refetchInterval: POLL_MS },
  });

  const currentRound = roundInfo ? Number(roundInfo[0]) : 0;

  const { data: playerInfo } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getPlayer",
    args: [BigInt(currentRound || 1), address || ZERO_ADDR],
    query: { refetchInterval: POLL_MS },
  });
  const { data: clawdAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [address || ZERO_ADDR, FOMO3D_ADDRESS],
    query: { refetchInterval: POLL_MS },
  });
  const { data: clawdBalance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "balanceOf",
    args: [address || ZERO_ADDR],
    query: { refetchInterval: POLL_MS },
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
    query: { refetchInterval: POLL_MS },
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
      const nowMs = Date.now();
      const now = Math.floor(nowMs / 1000);
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
      if (d > 0) {
        setCountdown(`${d}d ${pad(h)}:${pad(m)}:${pad(s)}`);
      } else if (h > 0) {
        setCountdown(`${pad(h)}:${pad(m)}:${pad(s)}`);
      } else {
        // Under 1 hour — show MM:SS.ms with flying centiseconds
        const diffMs = endTime * 1000 - nowMs;
        const cs = Math.floor((diffMs % 1000) / 10);
        setCountdown(`${pad(m)}:${pad(s)}.${pad(cs)}`);
      }
    };
    tick();
    // Use fast interval (50ms) so milliseconds fly when under 1 hour
    const iv = setInterval(tick, 50);
    return () => clearInterval(iv);
  }, [roundInfo]);

  // ============ Formatters ============
  const fmtC = (val: bigint | undefined) => {
    if (!val) return "0";
    return Number(formatEther(val)).toLocaleString(undefined, { maximumFractionDigits: 0 });
  };
  const fmtCDiv = (val: bigint | undefined) => {
    if (!val || val === 0n) return "0";
    const num = Number(formatEther(val));
    if (num === 0) return "0";
    if (num < 0.01) return "<0.01";
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
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
      await writeClawd({ functionName: "approve", args: [FOMO3D_ADDRESS, cost! * 5n] });
      notification.success("CLAWD APPROVED ✅");
      fireConfetti(e);
    } catch (err: unknown) {
      notification.error(decodeError(err));
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
      // Screen shake
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 300);
    } catch (err: unknown) {
      notification.error(decodeError(err));
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
    } catch (err: unknown) {
      notification.error(decodeError(err));
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
    } catch (err: unknown) {
      notification.error(decodeError(err));
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
    <div
      ref={pageRef}
      className={`relative z-[1] flex flex-col items-center gap-0 p-4 md:px-6 max-w-4xl mx-auto pb-16 font-mono ${isShaking ? "shake" : ""}`}
      onClick={e => triggerConfetti(e.clientX, e.clientY)}
    >
      {/* ═══════════════════════════════════════
          DISCLAIMER — EXPERIMENTAL SOFTWARE
         ═══════════════════════════════════════ */}
      {!disclaimerAccepted && (
        <div
          className="w-full mb-4 mt-2 border-2 border-[#f97316] bg-[#1a1520] rounded-2xl p-5 md:p-6 font-mono relative"
          style={{
            boxShadow: "0 0 20px rgba(249,115,22,0.2), inset 0 0 30px rgba(249,115,22,0.05)",
          }}
          onClick={e => e.stopPropagation()}
        >
          <div
            className="text-center text-sm md:text-base font-black tracking-[0.3em] uppercase mb-4 animate-pulse"
            style={{ color: "#f97316", textShadow: "0 0 15px rgba(249,115,22,0.9), 0 0 30px rgba(249,115,22,0.5)" }}
          >
            ⚠ WARNING — EXPERIMENTAL SOFTWARE ⚠
          </div>

          <div className="border-t border-[#f97316]/30 mb-4" />

          <div className="text-xs md:text-sm text-[#c9a0ff]/80 leading-relaxed space-y-3">
            <p>
              This entire app was built by an AI agent (<span className="text-[#f97316] font-bold">Clawd</span>
              ). Smart contracts are <span className="text-[#f97316] font-bold uppercase">unaudited</span>. This is an
              experiment, not a product. Expect bugs.
            </p>
            <p>
              By connecting your wallet, you accept{" "}
              <span className="text-[#f97316] font-bold">full responsibility</span> for your actions and any losses. You
              will probably lose your tokens.
            </p>
            <p className="text-[#8b7aaa]">Not financial advice. DYOR. Use at your own risk.</p>
          </div>

          <div className="border-t border-[#f97316]/30 mt-4 mb-4" />

          <div className="text-center">
            <button
              className="px-8 py-3 font-mono font-black text-sm tracking-[0.2em] uppercase rounded-xl
                         border-2 border-[#f97316] text-[#f97316] bg-[#f97316]/10
                         hover:bg-[#f97316]/25 hover:scale-105 active:scale-95
                         transition-all duration-150 cursor-pointer
                         shadow-[0_0_15px_rgba(249,115,22,0.3)]
                         hover:shadow-[0_0_25px_rgba(249,115,22,0.5)]"
              style={{ textShadow: "0 0 8px rgba(249,115,22,0.7)" }}
              onClick={() => setDisclaimerAccepted(true)}
            >
              [ I UNDERSTAND THE RISKS ]
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          HOW TO PLAY — smooth brain edition
         ═══════════════════════════════════════ */}
      <div className="w-full card-glass rounded-2xl p-6 md:p-8 text-center mt-4 mb-2">
        <h1
          className="text-2xl md:text-4xl font-black tracking-tight mb-1"
          style={{ color: "#f97316", textShadow: "0 0 20px rgba(249,115,22,0.6), 0 0 40px rgba(249,115,22,0.3)" }}
        >
          👑 LAST BUYER WINS EVERYTHING.
        </h1>
        <p className="text-[#8b7aaa] text-xs tracking-[0.2em] uppercase mb-6">a $CLAWD king-of-the-hill game on Base</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
          <div className="card-glass rounded-xl p-4">
            <div className="text-2xl mb-2">🔑</div>
            <div className="text-sm font-bold text-[#f0e6ff] mb-1">1. BUY A KEY</div>
            <div className="text-xs text-[#8b7aaa] leading-relaxed">
              Adds time to the clock. Makes YOU the King.
              <span className="text-[#c9a0ff]"> Bonus:</span> Key holders split 25% of the pot when the round ends!
            </div>
          </div>
          <div className="card-glass rounded-xl p-4">
            <div className="text-2xl mb-2">👑</div>
            <div className="text-sm font-bold text-[#f0e6ff] mb-1">2. HOLD THE THRONE</div>
            <div className="text-xs text-[#8b7aaa] leading-relaxed">
              If the timer hits <span className="text-[#f97316] font-bold">00:00:00</span> while you are King…
              <span className="text-[#f97316] font-bold"> YOU WIN THE POT.</span> 💰
            </div>
          </div>
          <div className="card-glass rounded-xl p-4">
            <div className="text-2xl mb-2">🔥</div>
            <div className="text-sm font-bold text-[#f0e6ff] mb-1">3. BURN IT ALL</div>
            <div className="text-xs text-[#8b7aaa] leading-relaxed">
              Every buy burns tokens. Number go up.
              <span className="text-[#c9a0ff]"> 10% burned on every purchase + 20% of the pot at round end.</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          HERO — COUNTDOWN TIMER
         ═══════════════════════════════════════ */}
      <div className="w-full card-glass rounded-2xl p-6 md:p-10 text-center mt-2">
        <div className="text-[10px] tracking-[0.4em] uppercase text-[#c9a0ff]/70 mb-1">
          ◆ round {currentRound || "—"}{" "}
          {isAntiSnipe ? "// ANTI-SNIPE ACTIVE" : isRoundActive ? "// ACTIVE" : "// ENDED"} ◆
        </div>

        <div
          className={`text-6xl md:text-[8rem] font-mono font-black tracking-tight leading-none my-4 md:my-6 ${
            isAntiSnipe ? "text-glow-intense animate-flicker" : isRoundActive ? "text-glow" : ""
          }`}
          style={{ color: "#f97316" }}
        >
          {countdown || "--:--:--"}
        </div>

        <div className="text-xs text-[#c9a0ff]/70 tracking-wider">
          {isRoundActive
            ? isAntiSnipe
              ? "🚨 UNDER 2 MIN — EVERY BUY EXTENDS THE TIMER 🚨"
              : "last buyer when timer hits zero wins the pot"
            : "round ended — execute endRound() to distribute"}
        </div>

        {isAntiSnipe && (
          <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 border border-[#f97316]/70 bg-[#f97316]/15 rounded-full">
            <div className="w-2 h-2 bg-[#f97316] animate-pulse-ring rounded-full" />
            <span className="text-[10px] text-[#f97316] tracking-[0.3em] uppercase font-bold">ANTI-SNIPE</span>
          </div>
        )}

        {/* END ROUND — right under timer when round is over */}
        {!isRoundActive && (
          <div className="mt-6">
            <div className="text-sm text-[#f97316] font-bold mb-2 text-glow-subtle animate-pulse">
              🏁 ROUND OVER — TIME TO DISTRIBUTE
            </div>
            <div className="text-xs text-[#8b7aaa] mb-3">60s grace for last buyer, then anyone can trigger it</div>
            {wrongNetwork ? (
              <button
                className="btn-crown rounded-xl py-4 px-10 text-lg hover:scale-[1.03] active:scale-95"
                disabled={isSwitching}
                onClick={handleSwitch}
              >
                {isSwitching ? "SWITCHING..." : "SWITCH TO BASE"}
              </button>
            ) : (
              <button
                className="btn-crown rounded-xl py-4 px-10 text-lg hover:scale-[1.03] active:scale-95 animate-pulse"
                disabled={isEnding}
                onClick={handleEndRound}
              >
                {isEnding ? "EXECUTING..." : "🏁 END ROUND & DISTRIBUTE 🏁"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════
          CURRENT LEADER
         ═══════════════════════════════════════ */}
      <div className="w-full card-glass rounded-xl p-4 text-center mt-3">
        <TermLabel>👑 current king</TermLabel>
        <div className="mt-2">
          {roundInfo && roundInfo[3] && roundInfo[3] !== ZERO_ADDR ? (
            <div className="flex justify-center">
              <Address address={roundInfo[3]} />
            </div>
          ) : (
            <span className="text-[#8b7aaa] text-sm">NO BUYERS YET — BE THE FIRST</span>
          )}
        </div>
      </div>

      <TermDivider />

      {/* ═══════════════════════════════════════
          BUY KEYS — "SNATCH THE CROWN"
         ═══════════════════════════════════════ */}
      <div
        className="w-full card-glass rounded-2xl p-5 md:p-6"
        style={{
          borderColor: "rgba(249, 115, 22, 0.4)",
          boxShadow: "0 0 20px rgba(249, 115, 22, 0.1), inset 0 0 30px rgba(249, 115, 22, 0.03)",
        }}
      >
        <div className="text-xs tracking-[0.3em] uppercase text-[#f97316] mb-4 font-bold text-glow-subtle">
          ◆ snatch the crown ◆
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1">
            <div className="text-xs text-[#c9a0ff]/70 mb-2">how many keys? (1-1000)</div>
            <input
              type="number"
              min="1"
              max="1000"
              value={numKeys}
              onChange={e => setNumKeys(e.target.value)}
              className="w-full bg-transparent border border-[#7c3aed]/50 rounded-xl px-4 py-3 text-center text-3xl font-bold text-[#f0e6ff] font-mono
                         focus:outline-none focus:border-[#7c3aed]/80 focus:shadow-[0_0_15px_rgba(124,58,237,0.3)] transition-all"
              placeholder="1"
            />

            {/* Quick select */}
            <div className="flex gap-1.5 mt-3">
              {[1, 5, 10, 25, 50, 100].map(n => (
                <button
                  key={n}
                  className={`flex-1 py-1.5 text-xs font-mono font-bold tracking-wider transition-all border rounded-lg cursor-pointer ${
                    numKeys === String(n)
                      ? "border-[#7c3aed]/70 bg-[#7c3aed]/25 text-[#c9a0ff]"
                      : "border-[#7c3aed]/30 text-[#8b7aaa] hover:border-[#7c3aed]/55 hover:text-[#c9a0ff]"
                  }`}
                  onClick={() => setNumKeys(String(n))}
                >
                  {n}
                </button>
              ))}
            </div>

            {cost && (
              <div className="mt-4 space-y-2">
                <div className="text-center py-3 px-4 rounded-xl bg-[#7c3aed]/10 border border-[#7c3aed]/30">
                  <div className="text-[10px] tracking-[0.3em] uppercase text-[#c9a0ff]/65 mb-1">cost</div>
                  <div
                    className="text-3xl md:text-5xl font-black font-mono tracking-tight text-glow"
                    style={{ color: "#f0e6ff" }}
                  >
                    {fmtCP(cost)} CLAWD
                  </div>
                  <div className="text-xl md:text-2xl font-bold font-mono mt-1" style={{ color: "#8b7aaa" }}>
                    → {toUsd(cost)}
                  </div>
                </div>
                <div className="flex justify-center">
                  <span className="text-[#f97316] text-xs font-mono">
                    🔥 {fmtC((cost * 10n) / 100n)} CLAWD burned on buy
                  </span>
                </div>
              </div>
            )}

            {address && clawdBalance !== undefined && (
              <div className="text-[10px] text-[#8b7aaa] mt-3 tracking-wider">
                your balance: {fmtC(clawdBalance)} CLAWD ({toUsd(clawdBalance)})
              </div>
            )}
          </div>

          {/* Action Button */}
          <div className="flex flex-col justify-center md:w-64 gap-3">
            {wrongNetwork ? (
              <button
                className="btn-action rounded-xl w-full py-5 px-8 text-base"
                disabled={isSwitching}
                onClick={handleSwitch}
              >
                {isSwitching ? "SWITCHING..." : "SWITCH TO BASE"}
              </button>
            ) : needsApproval ? (
              <button
                className="btn-crown rounded-xl w-full py-5 px-8 text-xl animate-pulse"
                disabled={isApproving}
                onClick={handleApprove}
              >
                {isApproving ? "APPROVING..." : "🔓 APPROVE CLAWD"}
              </button>
            ) : (
              <button
                ref={buyBtnRef}
                className={`btn-crown rounded-xl w-full py-5 px-8 text-xl ${
                  !isBuying && isRoundActive ? "hover:scale-[1.03] active:scale-95" : ""
                }`}
                disabled={isBuying || !isRoundActive}
                onClick={handleBuy}
              >
                {isBuying ? "EXECUTING..." : !isRoundActive ? "ROUND ENDED" : `SNATCH THE 👑`}
              </button>
            )}

            {needsApproval && (
              <div className="text-xs text-[#f97316]/70 text-center tracking-wider font-semibold">
                ⚡ one-time approval required
              </div>
            )}

            {/* BUY $CLAWD link */}
            <a
              href="https://app.uniswap.org/swap?outputCurrency=0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07&chain=base"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary rounded-xl py-2.5 px-6 text-xs text-center block"
              onClick={e => e.stopPropagation()}
            >
              {">> BUY $CLAWD ON UNISWAP <<"}
            </a>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          YOUR STATS
         ═══════════════════════════════════════ */}
      {address && (
        <>
          <TermDivider />
          <div className="w-full card-glass rounded-2xl p-5">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#c9a0ff]/65 mb-4">
              ◆ your stats — round {currentRound}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <TermLabel>your keys</TermLabel>
                <TermValue>{playerInfo ? Number(playerInfo[0]).toLocaleString() : "0"}</TermValue>
              </div>
              <div className="flex justify-between">
                <TermLabel>pending dividends</TermLabel>
                <div>
                  <TermValue glow>{playerInfo ? fmtCDiv(playerInfo[1]) : "0"} CLAWD</TermValue>
                  <span className="text-[#8b7aaa] text-xs ml-2">→ {playerInfo ? toUsd(playerInfo[1]) : ""}</span>
                </div>
              </div>
              {playerInfo && playerInfo[0] > 0n && playerInfo[1] === 0n && isRoundActive && (
                <div className="text-[10px] text-[#8b7aaa]/70 ml-1 -mt-1 mb-1">
                  💡 dividends are distributed when the round ends (25% of pot split by keys held)
                </div>
              )}
              {playerInfo && playerInfo[0] > 0n && isRoundActive && roundInfo && roundInfo[4] > 0n && (
                <div className="flex justify-between">
                  <TermLabel>est. payout at round end</TermLabel>
                  <div>
                    <span className="text-[#c9a0ff] font-mono text-sm">
                      ~{fmtC((((roundInfo[1] * 2500n) / 10000n) * playerInfo[0]) / roundInfo[4])} CLAWD
                    </span>
                  </div>
                </div>
              )}
              <div className="flex justify-between">
                <TermLabel>claimed</TermLabel>
                <span className="text-[#c9a0ff]">{playerInfo ? fmtCDiv(playerInfo[2]) : "0"} CLAWD</span>
              </div>
              <div className="flex justify-between">
                <TermLabel>CLAWD balance</TermLabel>
                <div>
                  <TermValue>{fmtC(clawdBalance)} CLAWD</TermValue>
                  {clawdPrice > 0 && clawdBalance !== undefined && clawdBalance > 0n && (
                    <span className="text-[#8b7aaa] text-xs ml-2">~{toUsd(clawdBalance)}</span>
                  )}
                </div>
              </div>
            </div>

            {playerInfo && playerInfo[1] > 0n && (
              <button
                className="btn-action rounded-xl w-full mt-4 py-2.5 text-sm"
                disabled={claimingRound === currentRound}
                onClick={() => handleClaim(currentRound)}
              >
                {claimingRound === currentRound ? "CLAIMING..." : `CLAIM ${fmtC(playerInfo[1])} CLAWD`}
              </button>
            )}
          </div>

          {/* Previous round dividends */}
          {currentRound > 1 && prevPlayerInfo && prevPlayerInfo[0] > 0n && (
            <div className="w-full card-glass rounded-xl p-5 mt-3">
              <div className="text-[10px] tracking-[0.3em] uppercase text-[#c9a0ff]/65 mb-4">
                ◆ dividends — round {currentRound - 1}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <TermLabel>keys</TermLabel>
                  <TermValue>{Number(prevPlayerInfo[0]).toLocaleString()}</TermValue>
                </div>
                <div className="flex justify-between">
                  <TermLabel>pending</TermLabel>
                  <TermValue glow>{fmtCDiv(prevPlayerInfo[1])} CLAWD</TermValue>
                </div>
                <div className="flex justify-between">
                  <TermLabel>claimed</TermLabel>
                  <span className="text-[#c9a0ff]">{fmtCDiv(prevPlayerInfo[2])} CLAWD</span>
                </div>
              </div>
              {prevPlayerInfo[1] > 0n && (
                <button
                  className="btn-action rounded-xl w-full mt-4 py-2.5 text-sm"
                  disabled={claimingRound === currentRound - 1}
                  onClick={() => handleClaim(currentRound - 1)}
                >
                  {claimingRound === currentRound - 1 ? "CLAIMING..." : `CLAIM ${fmtC(prevPlayerInfo[1])} CLAWD`}
                </button>
              )}
            </div>
          )}
        </>
      )}

      <TermDivider />

      {/* ═══════════════════════════════════════
          ROUND STATS
         ═══════════════════════════════════════ */}
      <div className="w-full card-glass rounded-2xl p-5 md:p-6">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[#c9a0ff]/65 mb-4">◆ round stats</div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-baseline">
            <TermLabel>💰 pot size</TermLabel>
            <div className="text-right">
              <TermValue glow>{roundInfo ? fmtC(roundInfo[1]) : "—"} CLAWD</TermValue>
              <span className="text-[#8b7aaa] text-xs ml-2">→ {roundInfo ? toUsd(roundInfo[1]) : ""}</span>
            </div>
          </div>

          <div className="flex justify-between items-baseline">
            <TermLabel>🔑 key price</TermLabel>
            <div className="text-right">
              <TermValue>{roundInfo ? fmtC(roundInfo[5]) : "—"} CLAWD</TermValue>
              <span className="text-[#8b7aaa] text-xs ml-2">→ {roundInfo ? toUsd(roundInfo[5]) : ""}</span>
            </div>
          </div>

          <div className="flex justify-between items-baseline">
            <TermLabel>🗝️ keys sold</TermLabel>
            <TermValue>{roundInfo ? Number(roundInfo[4]).toLocaleString() : "—"}</TermValue>
          </div>

          <div className="flex justify-between items-baseline">
            <TermLabel>🔥 total burned</TermLabel>
            <div className="text-right">
              <TermValue>{totalBurned !== undefined ? fmtC(totalBurned) : "—"} CLAWD</TermValue>
              <span className="text-[#8b7aaa] text-xs ml-2">
                → {totalBurned !== undefined ? toUsd(totalBurned) : ""}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          ROUND HISTORY / LEADERBOARD
         ═══════════════════════════════════════ */}
      {roundHistory.length > 0 && (
        <>
          <TermDivider />
          <div className="w-full card-glass rounded-2xl p-5">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#c9a0ff]/65 mb-4">🏆 round history</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-[#c9a0ff]/65 border-b border-[#7c3aed]/30">
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
                    <tr key={r.round} className="border-b border-[#7c3aed]/20 text-[#f0e6ff]/80">
                      <td className="py-2 pr-3 text-[#f97316]">#{r.round}</td>
                      <td className="py-2 pr-3">
                        <Address address={r.winner} />
                      </td>
                      <td className="text-right py-2 pr-3">{fmtC(r.potSize)}</td>
                      <td className="text-right py-2 pr-3 text-[#f97316]">{fmtC(r.winnerPayout)}</td>
                      <td className="text-right py-2 pr-3">{fmtC(r.burned)}</td>
                      <td className="text-right py-2">{Number(r.totalKeys).toLocaleString()}</td>
                      {address && <td className="text-right py-2 pl-3">{Number(r.playerKeys).toLocaleString()}</td>}
                      {address && (
                        <td className="text-right py-2 pl-3">
                          {r.playerPending > 0n ? (
                            <button
                              className="btn-action rounded-lg px-2 py-0.5 text-[10px]"
                              disabled={claimingRound === r.round}
                              onClick={() => handleClaim(r.round)}
                            >
                              {claimingRound === r.round ? "..." : `CLAIM ${fmtC(r.playerPending)}`}
                            </button>
                          ) : r.playerWithdrawn > 0n ? (
                            <span className="text-[#c9a0ff]/70">✓ {fmtC(r.playerWithdrawn)}</span>
                          ) : r.playerKeys > 0n ? (
                            <span className="text-[#8b7aaa]">none</span>
                          ) : (
                            <span className="text-[#8b7aaa]/50">—</span>
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
          POT DISTRIBUTION
         ═══════════════════════════════════════ */}
      <div className="w-full card-glass rounded-2xl p-5">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[#c9a0ff]/65 mb-4">◆ when the timer hits zero</div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <TermLabel>👑 winner (last buyer)</TermLabel>
            <TermValue glow>50%</TermValue>
          </div>
          <div className="flex justify-between">
            <TermLabel>🔥 burned forever</TermLabel>
            <TermValue>20%</TermValue>
          </div>
          <div className="flex justify-between">
            <TermLabel>💎 key holder dividends</TermLabel>
            <TermValue>25%</TermValue>
          </div>
          <div className="flex justify-between">
            <TermLabel>🌱 next round seed</TermLabel>
            <TermValue>5%</TermValue>
          </div>
        </div>
        <div className="text-[10px] text-[#8b7aaa] mt-3 tracking-wider text-center">
          + 10% of every key purchase is burned on buy 🔥
        </div>
      </div>

      <TermDivider />

      {/* ═══════════════════════════════════════
          FOOTER
         ═══════════════════════════════════════ */}
      <div className="w-full text-center space-y-2 text-[10px] text-[#8b7aaa] tracking-wider font-mono">
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

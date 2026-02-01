"use client";

import { useEffect, useState } from "react";
import { Address } from "@scaffold-ui/components";
import { formatEther } from "viem";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const CLAWD_TOKEN = "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07";
const TARGET_CHAIN_ID = 8453; // Base

export default function Home() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [numKeys, setNumKeys] = useState("1");
  const [isSwitching, setIsSwitching] = useState(false);
  const [isBuying, setIsBuying] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [clawdPrice, setClawdPrice] = useState(0);
  const [countdown, setCountdown] = useState("");
  const [antiSnipeFlash] = useState(false);

  // Read round info
  const { data: roundInfo } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getRoundInfo",
  });

  // Read total burned
  const { data: totalBurned } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "totalBurned",
  });

  // Read cost for numKeys
  const keysNum = parseInt(numKeys) || 0;
  const { data: cost } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "calculateCost",
    args: [BigInt(keysNum > 0 ? keysNum : 1)],
  });

  // Read player info
  const currentRound = roundInfo ? Number(roundInfo[0]) : 0;
  const { data: playerInfo } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getPlayer",
    args: [BigInt(currentRound || 1), address || "0x0000000000000000000000000000000000000000"],
  });

  // Past round results
  const { data: prevRoundResult } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "getRoundResult",
    args: [BigInt(currentRound > 1 ? currentRound - 1 : 0)],
  });

  // Pot cap check
  const { data: isPotCapReached } = useScaffoldReadContract({
    contractName: "ClawdFomo3D",
    functionName: "isPotCapReached",
  });

  // Write contracts
  const { writeContractAsync: writeFomo } = useScaffoldWriteContract({ contractName: "ClawdFomo3D" });

  // Fetch CLAWD price from DexScreener
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${CLAWD_TOKEN}`);
        const data = await res.json();
        if (data.pairs && data.pairs.length > 0) {
          setClawdPrice(parseFloat(data.pairs[0].priceUsd || "0"));
        }
      } catch {
        // Silently fail
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 30000);
    return () => clearInterval(interval);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!roundInfo) return;
    const endTime = Number(roundInfo[2]); // roundEnd

    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = endTime - now;
      if (diff <= 0) {
        setCountdown("EXPIRED");
        return;
      }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setCountdown(
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`,
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [roundInfo]);

  // Format CLAWD amount
  const formatClawd = (val: bigint | undefined) => {
    if (!val) return "0";
    return Number(formatEther(val)).toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const formatClawdUsd = (val: bigint | undefined) => {
    if (!val || !clawdPrice) return "";
    const amount = Number(formatEther(val));
    return `~$${(amount * clawdPrice).toFixed(2)}`;
  };

  // Handlers
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

  const handleBuy = async () => {
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
      notification.success(`Bought ${keysNum} keys! 🔑`);
    } catch (e: any) {
      console.error(e);
      if (e?.message?.includes("user rejected")) {
        notification.error("Transaction rejected");
      } else {
        notification.error("Buy failed — check CLAWD approval and balance");
      }
    } finally {
      setIsBuying(false);
    }
  };

  const handleEndRound = async () => {
    setIsEnding(true);
    try {
      await writeFomo({
        functionName: "endRound",
      });
      notification.success("Round ended! 🎉");
    } catch (e: any) {
      console.error(e);
      notification.error("End round failed");
    } finally {
      setIsEnding(false);
    }
  };

  const handleClaim = async () => {
    if (!currentRound) return;
    setIsClaiming(true);
    try {
      // Claim from previous round
      const claimRound = currentRound > 1 ? currentRound - 1 : currentRound;
      await writeFomo({
        functionName: "claimDividends",
        args: [BigInt(claimRound)],
      });
      notification.success("Dividends claimed! 💰");
    } catch (e: any) {
      console.error(e);
      notification.error("Claim failed — no dividends available");
    } finally {
      setIsClaiming(false);
    }
  };

  const isRoundActive = roundInfo ? Boolean(roundInfo[7]) : false;
  const wrongNetwork = chainId !== TARGET_CHAIN_ID;

  return (
    <div className="flex flex-col items-center gap-6 p-4 max-w-4xl mx-auto">
      {/* Hero: Countdown Timer */}
      <div className="w-full bg-gradient-to-br from-red-900 via-orange-900 to-yellow-900 rounded-2xl p-8 text-center shadow-2xl border border-orange-500/30">
        <div className="text-sm uppercase tracking-widest text-orange-300 mb-1">Round {currentRound || "—"}</div>
        <div
          className={`text-6xl md:text-8xl font-mono font-bold tracking-wider mb-3 ${
            countdown === "EXPIRED" ? "text-red-400 animate-pulse" : "text-white"
          } ${antiSnipeFlash ? "text-yellow-300" : ""}`}
        >
          {countdown || "--:--:--"}
        </div>
        <div className="text-sm text-orange-200">
          {isRoundActive ? "⏳ Until last buyer wins the pot" : "🏆 Round has ended!"}
        </div>
        {roundInfo && roundInfo[3] && (
          <div className="text-xs text-orange-400 mt-1">
            Hard max: {new Date(Number(roundInfo[3]) * 1000).toLocaleString()}
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
        <div className="bg-base-200 rounded-xl p-4 text-center">
          <div className="text-xs text-base-content/60 uppercase">🏆 Pot</div>
          <div className="text-xl font-bold text-primary">{roundInfo ? formatClawd(roundInfo[1]) : "—"}</div>
          <div className="text-xs text-base-content/50">{roundInfo ? formatClawdUsd(roundInfo[1]) : ""} CLAWD</div>
          {roundInfo && roundInfo[8] > 0n && (
            <div className="text-xs text-warning mt-1">
              Cap: {formatClawd(roundInfo[8])} {isPotCapReached ? "⛔ REACHED" : ""}
            </div>
          )}
        </div>
        <div className="bg-base-200 rounded-xl p-4 text-center">
          <div className="text-xs text-base-content/60 uppercase">🔑 Key Price</div>
          <div className="text-xl font-bold">{roundInfo ? formatClawd(roundInfo[6]) : "—"}</div>
          <div className="text-xs text-base-content/50">{roundInfo ? formatClawdUsd(roundInfo[6]) : ""} CLAWD</div>
        </div>
        <div className="bg-base-200 rounded-xl p-4 text-center">
          <div className="text-xs text-base-content/60 uppercase">🔑 Total Keys</div>
          <div className="text-xl font-bold">{roundInfo ? Number(roundInfo[5]).toLocaleString() : "—"}</div>
        </div>
        <div className="bg-base-200 rounded-xl p-4 text-center">
          <div className="text-xs text-base-content/60 uppercase">🔥 Total Burned</div>
          <div className="text-xl font-bold text-error">{totalBurned ? formatClawd(totalBurned) : "—"}</div>
          <div className="text-xs text-base-content/50">{totalBurned ? formatClawdUsd(totalBurned) : ""} CLAWD</div>
        </div>
      </div>

      {/* Last Buyer */}
      <div className="bg-base-200 rounded-xl p-4 w-full text-center">
        <div className="text-xs text-base-content/60 uppercase mb-1">👑 Last Buyer (Current Leader)</div>
        {roundInfo && roundInfo[4] && roundInfo[4] !== "0x0000000000000000000000000000000000000000" ? (
          <Address address={roundInfo[4]} />
        ) : (
          <span className="text-base-content/40">No buyers yet — be the first!</span>
        )}
      </div>

      {/* Buy Keys Section */}
      <div className="bg-base-200 rounded-xl p-6 w-full">
        <h2 className="text-lg font-bold mb-4">🔑 Buy Keys</h2>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <label className="text-sm text-base-content/60 mb-1 block">Number of keys (1-1000)</label>
            <input
              type="number"
              min="1"
              max="1000"
              value={numKeys}
              onChange={e => setNumKeys(e.target.value)}
              className="input input-bordered w-full"
              placeholder="1"
            />
            {cost && (
              <div className="text-sm mt-1 text-base-content/60">
                Cost: {formatClawd(cost)} CLAWD {formatClawdUsd(cost)}
              </div>
            )}
          </div>
          <div className="w-full sm:w-auto">
            {wrongNetwork ? (
              <button className="btn btn-primary w-full sm:w-auto" disabled={isSwitching} onClick={handleSwitch}>
                {isSwitching ? "Switching..." : "Switch to Base"}
              </button>
            ) : (
              <button
                className="btn btn-primary w-full sm:w-auto"
                disabled={isBuying || !isRoundActive || Boolean(isPotCapReached)}
                onClick={handleBuy}
              >
                {isBuying ? "Buying..." : isPotCapReached ? "Pot Cap Reached" : `Buy ${keysNum || 0} Keys`}
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-base-content/40 mt-2">
          ⚠️ You must approve CLAWD spending first. Use the Debug tab or approve directly. 10% of every buy is burned
          permanently. Each buy resets the countdown timer.
        </p>
      </div>

      {/* End Round / Claim Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
        <div className="bg-base-200 rounded-xl p-4">
          <h3 className="text-sm font-bold mb-2">🏁 End Round</h3>
          <p className="text-xs text-base-content/60 mb-3">
            Call when timer expires. 60s grace period for last buyer, then anyone can call.
          </p>
          <button
            className="btn btn-warning btn-sm w-full"
            disabled={isEnding || isRoundActive}
            onClick={handleEndRound}
          >
            {isEnding ? "Ending..." : countdown === "EXPIRED" ? "End Round" : "Timer Still Running"}
          </button>
        </div>

        <div className="bg-base-200 rounded-xl p-4">
          <h3 className="text-sm font-bold mb-2">💰 Claim Dividends</h3>
          {playerInfo && (
            <div className="text-xs text-base-content/60 mb-2">
              Your keys: {Number(playerInfo[0]).toLocaleString()} | Pending: {formatClawd(playerInfo[1])} CLAWD |
              Claimed: {formatClawd(playerInfo[2])} CLAWD
            </div>
          )}
          <button
            className="btn btn-success btn-sm w-full"
            disabled={isClaiming || !playerInfo || playerInfo[1] === 0n}
            onClick={handleClaim}
          >
            {isClaiming ? "Claiming..." : "Claim Dividends"}
          </button>
        </div>
      </div>

      {/* Distribution Info */}
      <div className="bg-base-200 rounded-xl p-6 w-full">
        <h2 className="text-lg font-bold mb-3">📊 Pot Distribution</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-2xl font-bold text-success">40%</div>
            <div className="text-xs text-base-content/60">Winner</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-error">30%</div>
            <div className="text-xs text-base-content/60">Burned 🔥</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-info">25%</div>
            <div className="text-xs text-base-content/60">Key Holder Dividends</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-warning">5%</div>
            <div className="text-xs text-base-content/60">Dev Fee</div>
          </div>
        </div>
      </div>

      {/* Past Round Result */}
      {prevRoundResult && prevRoundResult.winner !== "0x0000000000000000000000000000000000000000" && (
        <div className="bg-base-200 rounded-xl p-4 w-full">
          <h3 className="text-sm font-bold mb-2">🏆 Previous Round Winner</h3>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-base-content/60">Winner:</span>
              <Address address={prevRoundResult.winner} />
            </div>
            <div className="text-xs text-base-content/60">
              Pot: {formatClawd(prevRoundResult.potSize)} CLAWD | Won: {formatClawd(prevRoundResult.winnerPayout)} CLAWD
              | Burned: {formatClawd(prevRoundResult.burned)} CLAWD | Keys:{" "}
              {Number(prevRoundResult.totalKeys).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* How it Works */}
      <div className="bg-base-200 rounded-xl p-6 w-full">
        <h2 className="text-lg font-bold mb-3">❓ How It Works</h2>
        <div className="text-sm text-base-content/70 space-y-2">
          <p>
            <strong>1. Buy Keys</strong> — Spend $CLAWD to buy keys. Price increases with each key sold (bonding curve).
            10% of your payment is burned immediately.
          </p>
          <p>
            <strong>2. Reset the Timer</strong> — Each purchase resets the countdown. You become the &quot;last
            buyer.&quot;
          </p>
          <p>
            <strong>3. Win the Pot</strong> — When the timer runs out, the last buyer wins 40% of the pot! 30% is burned
            forever, 25% goes to all key holders as dividends, 5% to dev.
          </p>
          <p>
            <strong>🛡️ Anti-Snipe</strong> — If someone buys within the last 2 minutes, the timer extends by 2 minutes
            (capped at a hard maximum so the round always ends).
          </p>
          <p>
            <strong>🧪 Trial Round</strong> — This is a trial version with a max pot cap of 1M CLAWD. Once reached, no
            more buys — timer just runs out.
          </p>
          <p>
            <strong>⚡ End Round</strong> — Anyone can end the round after the timer expires (60s grace period for the
            last buyer).
          </p>
          <p>
            <strong>💰 Dividends</strong> — Key holders earn a share of every round&apos;s pot (25%). Claim after rounds
            end.
          </p>
        </div>
      </div>

      {/* CLAWD Price Footer */}
      <div className="text-xs text-base-content/40 text-center">
        $CLAWD Price: ${clawdPrice.toFixed(6)} USD (via DexScreener) • Token:{" "}
        <span className="font-mono">
          {CLAWD_TOKEN.slice(0, 6)}...{CLAWD_TOKEN.slice(-4)}
        </span>
      </div>
    </div>
  );
}

![ClawFomo.com](packages/nextjs/public/og-image.png)

# ClawFomo.com

> An AI-built Fomo3D game on Base using $CLAWD tokens.

```
┌──────────────────────────────────────────────────────────────┐
│  BUY KEYS → RESET TIMER → LAST BUYER WINS THE POT  🦞      │
└──────────────────────────────────────────────────────────────┘
```

## How It Works

1. **Buy Keys** — Spend $CLAWD tokens to acquire keys. Price increases with each key sold (bonding curve).
2. **Reset Timer** — Every purchase resets the 5-minute countdown. You become the leader.
3. **Win the Pot** — When the timer hits zero, the last buyer wins. Pot is distributed automatically.

```
  ┌─────────────────────────────────────┐
  │  TIMER: 05:00 ──────▶ 00:00        │
  │  LAST BUYER TAKES THE POT          │
  └─────────────────────────────────────┘
```

## Contract Parameters

| Parameter | Value |
|---|---|
| **Winner (last buyer)** | 50% of pot |
| **Burned (forever)** | 20% of pot |
| **Key holder dividends** | 25% of pot |
| **Next round seed** | 5% of pot |
| **Burn on every purchase** | 10% |
| **Timer duration** | 5 minutes |
| **Key price increment** | 110 CLAWD per key |
| **Anti-snipe zone** | Last 2 minutes (extends timer on buy) |

## Links

| | |
|---|---|
| 🌐 **Live App** | [clawfomo.com](https://clawfomo.com) |
| 📜 **Contract** | [`0x572Bc6149a5A9b013b5e9c370aEf6Fec8388F53f`](https://basescan.org/address/0x572Bc6149a5A9b013b5e9c370aEf6Fec8388F53f) |
| 🦞 **$CLAWD Token** | [`0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07`](https://basescan.org/token/0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07) |
| 💱 **Buy $CLAWD** | [Uniswap](https://app.uniswap.org/swap?outputCurrency=0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07&chain=base) |

## Stack

- **Frontend:** Next.js + Tailwind CSS
- **Framework:** [Scaffold-ETH 2](https://scaffoldeth.io)
- **Contracts:** Solidity + Foundry
- **Network:** Base (L2)

## Built by Clawd

This entire project — contracts, frontend, deployment — was built by [Clawd](https://x.com/clawdbotatg), an AI agent running on [Scaffold-ETH 2](https://scaffoldeth.io).

```
  ┌─────────────────────────────────┐
  │  🤖 BUILT BY AI. USE AT YOUR   │
  │     OWN RISK. UNAUDITED.       │
  │     EXPECT BUGS. HAVE FUN.     │
  └─────────────────────────────────┘
```

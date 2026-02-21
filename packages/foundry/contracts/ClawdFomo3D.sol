// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ClawdFomo3D v10
 * @notice FOMO3D king-of-the-hill game with $CLAWD tokens on Base.
 *         Last buyer wins when countdown timer expires.
 *         32-hour cooldown between rounds. Halved burn rates.
 *
 * v10 changes:
 *   - Buy burn: 10% → 5%
 *   - End burn: 20% → 10%
 *   - Winner: 50% → 55%
 *   - Next round seed: 5% → 10%
 *   - 32-hour cooldown between rounds
 *   - Active timer: 10 minutes (deploy)
 *
 * Dividend flow:
 *   On each buy: 5% burned, 25% of after-burn to existing key holders, 75% of after-burn to pot.
 *   On round end: pot split 55% winner / 10% burn / 25% dividends / 10% next round seed.
 */
contract ClawdFomo3D is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    uint256 public constant BURN_ON_BUY_BPS = 500;         // 5% burned on every buy
    uint256 public constant WINNER_BPS = 5500;             // 55% of pot to winner
    uint256 public constant BURN_ON_END_BPS = 1000;        // 10% of pot burned at round end
    uint256 public constant DIVIDENDS_BPS = 2500;          // 25% to key holders
    uint256 public constant NEXT_ROUND_SEED_BPS = 1000;   // 10% seeds next round's pot
    uint256 public constant BPS = 10000;

    uint256 public constant BUY_DIVIDENDS_BPS = 2500;       // 25% of after-burn to existing key holders on each buy

    uint256 public constant ANTI_SNIPE_THRESHOLD = 2 minutes;
    uint256 public constant ANTI_SNIPE_EXTENSION = 2 minutes;

    uint256 public constant BASE_PRICE = 1000 * 1e18;     // 1000 CLAWD base
    uint256 public constant PRICE_INCREMENT = 110 * 1e18;  // +110 CLAWD per key sold
    uint256 public constant MAX_KEYS_PER_BUY = 1000;       // #6: overflow protection

    uint256 public constant COOLDOWN_DURATION = 32 hours;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    // ============ Immutables ============
    IERC20 public immutable clawd;
    uint256 public immutable timerDuration;

    // ============ State ============
    uint256 public currentRound;
    uint256 public roundStart;
    uint256 public roundEnd;
    uint256 public pot;
    uint256 public totalKeys;
    address public lastBuyer;
    uint256 public totalBurned;

    // Dividend tracking (points-per-share)
    uint256 public pointsPerKey;
    uint256 internal constant MAGNITUDE = 2**128;
    uint256 public dividendRemainder;    // #8: dust tracking
    uint256 public nextRoundSeed;        // 10% from previous round seeds the next pot
    bool public inCooldown;              // true during 32-hour cooldown between rounds
    uint256 public roundCooldownEnd;     // timestamp when cooldown expires

    // Per-round PPK snapshots — prevents cross-round dividend leakage
    mapping(uint256 => uint256) public roundPointsPerKey;

    struct Player {
        uint256 keys;
        int256 pointsCorrection;
        uint256 withdrawnDividends;
    }

    mapping(uint256 => mapping(address => Player)) public players;
    mapping(uint256 => RoundResult) public roundResults;

    struct RoundResult {
        address winner;
        uint256 potSize;
        uint256 winnerPayout;
        uint256 burned;
        uint256 endTime;
        uint256 totalKeys;
    }

    /// @notice Extended round result with computed fields for batch reads
    struct RoundResultFull {
        uint256 roundId;
        address winner;
        uint256 potSize;
        uint256 totalKeys;
        uint256 winnerPayout;
        uint256 burnAmount;
        uint256 dividendsPayout;
        uint256 seedAmount;
    }

    // ============ Events ============
    event KeysPurchased(uint256 indexed round, address indexed buyer, uint256 keys, uint256 cost, uint256 burned);
    event RoundEnded(uint256 indexed round, address indexed winner, uint256 payout, uint256 burned);
    event RoundReset(uint256 indexed round);
    event DividendsClaimed(uint256 indexed round, address indexed player, uint256 amount);
    event RoundStarted(uint256 indexed round, uint256 endTime);
    event TimerExtended(uint256 indexed round, uint256 newEndTime);
    event CooldownStarted(uint256 indexed round, uint256 cooldownEnd);

    // ============ Constructor ============
    constructor(
        address _clawd,
        uint256 _timerDuration
    ) Ownable(msg.sender) {
        // #7: Constructor validation
        require(_clawd != address(0), "CLAWD address cannot be zero");
        require(_timerDuration > 0, "Timer duration must be > 0");

        clawd = IERC20(_clawd);
        timerDuration = _timerDuration;

        currentRound = 1;
        roundStart = block.timestamp;
        roundEnd = block.timestamp + _timerDuration;

        emit RoundStarted(1, roundEnd);
    }

    // ============ Admin ============

    /// @notice Emergency pause (#2)
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ Core Game ============

    /// @notice Buy keys with CLAWD tokens
    /// @param numKeys Number of keys to buy (1 to MAX_KEYS_PER_BUY)
    function buyKeys(uint256 numKeys) external nonReentrant whenNotPaused {
        require(!inCooldown, "In cooldown");
        require(numKeys > 0 && numKeys <= MAX_KEYS_PER_BUY, "Invalid key count");
        require(block.timestamp < roundEnd, "Round ended");

        // Calculate cost using bonding curve: sum of (BASE_PRICE + i * INCREMENT) for i = totalKeys..totalKeys+numKeys-1
        uint256 cost = _calculateCost(numKeys);

        // 10% burn on buy
        uint256 burnAmount = (cost * BURN_ON_BUY_BPS) / BPS;
        uint256 afterBurn = cost - burnAmount;

        // Transfer CLAWD from buyer
        clawd.safeTransferFrom(msg.sender, address(this), cost);

        // Burn
        clawd.safeTransfer(DEAD, burnAmount);
        totalBurned += burnAmount;

        // #12: Distribute dividends to existing key holders BEFORE adding buyer's keys
        // 25% of after-burn goes to existing holders; 75% goes to pot
        uint256 dividendAmount = 0;
        if (totalKeys > 0) {
            dividendAmount = (afterBurn * BUY_DIVIDENDS_BPS) / BPS;
            pointsPerKey += (dividendAmount * MAGNITUDE) / totalKeys;
        }

        // Add remainder to pot (if no existing holders, full afterBurn goes to pot)
        pot += (afterBurn - dividendAmount);

        // Update player keys
        Player storage player = players[currentRound][msg.sender];
        player.keys += numKeys;
        // Adjust points correction so buyer doesn't earn from their own purchase
        player.pointsCorrection -= int256(pointsPerKey * numKeys);

        totalKeys += numKeys;
        lastBuyer = msg.sender;

        // Anti-snipe: extend timer if within threshold
        if (roundEnd - block.timestamp < ANTI_SNIPE_THRESHOLD) {
            uint256 newEnd = block.timestamp + ANTI_SNIPE_EXTENSION;
            if (newEnd > roundEnd) {
                roundEnd = newEnd;
                emit TimerExtended(currentRound, newEnd);
            }
        }

        emit KeysPurchased(currentRound, msg.sender, numKeys, cost, burnAmount);
    }

    /// @notice End the round and distribute pot
    function endRound() external nonReentrant whenNotPaused {
        require(!inCooldown, "Already in cooldown");
        require(block.timestamp >= roundEnd, "Round not ended yet");

        // #11: If no one bought keys, enter cooldown (no distribution needed)
        if (lastBuyer == address(0) || totalKeys == 0) {
            roundPointsPerKey[currentRound] = pointsPerKey;
            inCooldown = true;
            roundCooldownEnd = block.timestamp + COOLDOWN_DURATION;
            emit RoundReset(currentRound);
            emit CooldownStarted(currentRound, roundCooldownEnd);
            return;
        }

        uint256 potSize = pot;
        uint256 winnerPayout = (potSize * WINNER_BPS) / BPS;
        uint256 burnPayout = (potSize * BURN_ON_END_BPS) / BPS;
        uint256 dividendsPayout = (potSize * DIVIDENDS_BPS) / BPS;
        uint256 seedAmount = (potSize * NEXT_ROUND_SEED_BPS) / BPS;

        // #8: Track dust remainder
        uint256 distributed = winnerPayout + burnPayout + dividendsPayout + seedAmount;
        uint256 dust = potSize - distributed;
        dividendRemainder += dust;

        // Seed the next round's pot (tokens stay in contract)
        nextRoundSeed += seedAmount;

        // Record round result
        roundResults[currentRound] = RoundResult({
            winner: lastBuyer,
            potSize: potSize,
            winnerPayout: winnerPayout,
            burned: burnPayout,
            endTime: block.timestamp,
            totalKeys: totalKeys
        });

        // Distribute
        clawd.safeTransfer(lastBuyer, winnerPayout);
        clawd.safeTransfer(DEAD, burnPayout);
        totalBurned += burnPayout;

        // Distribute dividends via points-per-share
        if (totalKeys > 0) {
            pointsPerKey += (dividendsPayout * MAGNITUDE) / totalKeys;
        }

        // Snapshot PPK for this round before starting a new one
        roundPointsPerKey[currentRound] = pointsPerKey;

        emit RoundEnded(currentRound, lastBuyer, winnerPayout, burnPayout);

        // Enter cooldown instead of starting new round immediately
        inCooldown = true;
        roundCooldownEnd = block.timestamp + COOLDOWN_DURATION;
        emit CooldownStarted(currentRound, roundCooldownEnd);
    }

    /// @notice Start the next round after cooldown expires. Permissionless.
    function startNextRound() external whenNotPaused {
        require(inCooldown, "Not in cooldown");
        require(block.timestamp >= roundCooldownEnd, "Cooldown not over");
        inCooldown = false;
        _startNewRound();
    }

    /// @notice Claim accumulated dividends for a specific round
    function claimDividends(uint256 round) external nonReentrant {
        require(round > 0 && round <= currentRound, "Invalid round");

        // For the current round, dividends come from current pointsPerKey
        // For past rounds, they also use the current pointsPerKey since it accumulates
        Player storage player = players[round][msg.sender];
        uint256 owed = _dividendsOf(round, msg.sender);
        require(owed > 0, "No dividends");

        player.withdrawnDividends += owed;
        clawd.safeTransfer(msg.sender, owed);

        emit DividendsClaimed(round, msg.sender, owed);
    }

    /// @notice Claim all unclaimed dividends across all rounds in a single transaction
    /// @return totalClaimed The total amount of CLAWD claimed
    function claimAllDividends() external nonReentrant returns (uint256 totalClaimed) {
        uint256 rounds = currentRound;
        totalClaimed = 0;

        for (uint256 r = 1; r <= rounds; r++) {
            Player storage player = players[r][msg.sender];
            uint256 owed = _dividendsOf(r, msg.sender);
            if (owed > 0) {
                player.withdrawnDividends += owed;
                totalClaimed += owed;
                emit DividendsClaimed(r, msg.sender, owed);
            }
        }

        require(totalClaimed > 0, "No dividends");
        clawd.safeTransfer(msg.sender, totalClaimed);
    }

    // ============ View Functions ============

    /// @notice Get the cost to buy numKeys keys at current price
    function calculateCost(uint256 numKeys) external view returns (uint256) {
        return _calculateCost(numKeys);
    }

    /// @notice Get current key price (price for the next key)
    function currentKeyPrice() external view returns (uint256) {
        return BASE_PRICE + totalKeys * PRICE_INCREMENT;
    }

    /// @notice Get pending dividends for a player in a round
    function pendingDividends(uint256 round, address player) external view returns (uint256) {
        return _dividendsOf(round, player);
    }

    /// @notice Get total unclaimed dividends across all rounds for a player
    /// @param player The player address to check
    /// @return total The total unclaimed CLAWD across all rounds
    function totalUnclaimedDividends(address player) external view returns (uint256 total) {
        uint256 rounds = currentRound;
        total = 0;
        for (uint256 r = 1; r <= rounds; r++) {
            total += _dividendsOf(r, player);
        }
    }

    /// @notice Get player info for a round
    function getPlayer(uint256 round, address addr) external view returns (uint256 keys, uint256 pending, uint256 withdrawn) {
        Player storage p = players[round][addr];
        keys = p.keys;
        pending = _dividendsOf(round, addr);
        withdrawn = p.withdrawnDividends;
    }

    /// @notice Get round info
    function getRoundInfo() external view returns (
        uint256 round,
        uint256 potSize,
        uint256 endTime,
        address lastBuyerAddr,
        uint256 keys,
        uint256 keyPrice,
        bool isActive,
        bool cooldown,
        uint256 cooldownEnd
    ) {
        round = currentRound;
        potSize = pot;
        endTime = roundEnd;
        lastBuyerAddr = lastBuyer;
        keys = totalKeys;
        keyPrice = BASE_PRICE + totalKeys * PRICE_INCREMENT;
        isActive = !inCooldown && block.timestamp < roundEnd;
        cooldown = inCooldown;
        cooldownEnd = roundCooldownEnd;
    }

    /// @notice Get round result
    function getRoundResult(uint256 round) external view returns (RoundResult memory) {
        return roundResults[round];
    }

    // ============ Batch Read Functions ============

    /// @notice Get the total number of rounds (including current active round)
    function getRoundCount() external view returns (uint256) {
        return currentRound;
    }

    /// @notice Get the latest N completed rounds, counting back from the most recent
    /// @param count How many rounds to return (will return fewer if not enough completed rounds)
    function getLatestRounds(uint256 count) external view returns (RoundResultFull[] memory) {
        uint256 completedRounds = currentRound > 1 ? currentRound - 1 : 0;
        if (count > completedRounds) count = completedRounds;
        if (count == 0) return new RoundResultFull[](0);

        RoundResultFull[] memory results = new RoundResultFull[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 roundId = completedRounds - i; // newest first
            results[i] = _buildRoundResultFull(roundId);
        }
        return results;
    }

    /// @notice Get a batch of round results starting from a specific round
    /// @param startRound The first round to include (1-indexed)
    /// @param count How many rounds to return
    function getRoundResultsBatch(uint256 startRound, uint256 count) external view returns (RoundResultFull[] memory) {
        require(startRound > 0, "Round starts at 1");
        uint256 completedRounds = currentRound > 1 ? currentRound - 1 : 0;
        if (startRound > completedRounds) return new RoundResultFull[](0);

        // Cap count to available rounds from startRound
        uint256 available = completedRounds - startRound + 1;
        if (count > available) count = available;
        if (count == 0) return new RoundResultFull[](0);

        RoundResultFull[] memory results = new RoundResultFull[](count);
        for (uint256 i = 0; i < count; i++) {
            results[i] = _buildRoundResultFull(startRound + i);
        }
        return results;
    }

    /// @dev Build a full round result from stored data + computed fields
    function _buildRoundResultFull(uint256 roundId) internal view returns (RoundResultFull memory) {
        RoundResult storage r = roundResults[roundId];
        return RoundResultFull({
            roundId: roundId,
            winner: r.winner,
            potSize: r.potSize,
            totalKeys: r.totalKeys,
            winnerPayout: r.winnerPayout,
            burnAmount: r.burned,
            dividendsPayout: (r.potSize * DIVIDENDS_BPS) / BPS,
            seedAmount: (r.potSize * NEXT_ROUND_SEED_BPS) / BPS
        });
    }

    // ============ Internal ============

    function _calculateCost(uint256 numKeys) internal view returns (uint256) {
        // Sum of arithmetic series: n * BASE_PRICE + INCREMENT * sum(totalKeys..totalKeys+n-1)
        // = n * BASE_PRICE + INCREMENT * (n * totalKeys + n*(n-1)/2)
        uint256 n = numKeys;
        uint256 baseCost = n * BASE_PRICE;
        uint256 incrementCost = PRICE_INCREMENT * (n * totalKeys + (n * (n - 1)) / 2);
        return baseCost + incrementCost;
    }

    function _dividendsOf(uint256 round, address addr) internal view returns (uint256) {
        Player storage p = players[round][addr];
        if (p.keys == 0) return 0;
        // Use snapshot for completed rounds, live value for current round
        uint256 ppk = round < currentRound ? roundPointsPerKey[round] : pointsPerKey;
        int256 totalEarned = int256(ppk * p.keys) + p.pointsCorrection;
        if (totalEarned < 0) return 0;
        uint256 earned = uint256(totalEarned) / MAGNITUDE;
        if (earned <= p.withdrawnDividends) return 0;
        return earned - p.withdrawnDividends;
    }

    function _startNewRound() internal {
        pointsPerKey = 0; // Reset PPK for new round — prevents cross-round leakage
        currentRound++;
        roundStart = block.timestamp;
        roundEnd = block.timestamp + timerDuration;
        pot = dividendRemainder + nextRoundSeed; // #8: carry forward dust + seed from previous round
        dividendRemainder = 0;
        nextRoundSeed = 0;
        totalKeys = 0;
        lastBuyer = address(0);

        emit RoundStarted(currentRound, roundEnd);
    }

}

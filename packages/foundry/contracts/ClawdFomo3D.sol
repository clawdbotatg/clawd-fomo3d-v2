// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ClawdFomo3D v2
 * @notice Safer FOMO3D king-of-the-hill game with $CLAWD tokens.
 *         Last buyer wins when countdown timer expires.
 *
 * Safety fixes implemented:
 *   #2  - Emergency pause (Pausable) + TimerExtended event
 *   #5  - Anti-snipe hard cap (MAX_ROUND_LENGTH)
 *   #6  - Overflow protection (MAX_KEYS_PER_BUY)
 *   #7  - Constructor validation (non-zero addresses/timer)
 *   #8  - Dividend dust tracking (remainder carried forward)
 *   #9  - Anti-snipe cap (clamped to maxEndTime)
 *   #10 - Grace period for endRound (lastBuyer priority)
 *   #11 - Round deadlock fix (endRound resets if no buys)
 *
 * Trial round: configurable max pot size cap.
 */
contract ClawdFomo3D is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    uint256 public constant BURN_ON_BUY_BPS = 1000;       // 10% burned on every buy
    uint256 public constant WINNER_BPS = 4000;             // 40% of pot to winner
    uint256 public constant BURN_ON_END_BPS = 3000;        // 30% of pot burned at round end
    uint256 public constant DIVIDENDS_BPS = 2500;          // 25% to key holders
    uint256 public constant DEV_BPS = 500;                 // 5% to dev
    uint256 public constant BPS = 10000;

    uint256 public constant ANTI_SNIPE_THRESHOLD = 2 minutes;
    uint256 public constant ANTI_SNIPE_EXTENSION = 2 minutes;
    uint256 public constant MAX_ROUND_LENGTH = 7 days;     // #5/#9: hard cap

    uint256 public constant BASE_PRICE = 1000 * 1e18;     // 1000 CLAWD base
    uint256 public constant PRICE_INCREMENT = 10 * 1e18;   // +10 CLAWD per key sold
    uint256 public constant MAX_KEYS_PER_BUY = 1000;       // #6: overflow protection

    uint256 public constant GRACE_PERIOD = 60;             // #10: 60s grace for lastBuyer

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    // ============ Immutables ============
    IERC20 public immutable clawd;
    address public immutable dev;
    uint256 public immutable timerDuration;

    // ============ State ============
    uint256 public currentRound;
    uint256 public roundStart;
    uint256 public roundEnd;
    uint256 public maxEndTime;           // #9: hard cap end time
    uint256 public pot;
    uint256 public totalKeys;
    address public lastBuyer;
    uint256 public totalBurned;

    // Trial round pot cap
    uint256 public potCap;               // 0 = no cap

    // Dividend tracking (points-per-share)
    uint256 public pointsPerKey;
    uint256 internal constant MAGNITUDE = 2**128;
    uint256 public dividendRemainder;    // #8: dust tracking

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

    // ============ Events ============
    event KeysPurchased(uint256 indexed round, address indexed buyer, uint256 keys, uint256 cost, uint256 burned);
    event RoundEnded(uint256 indexed round, address indexed winner, uint256 payout, uint256 burned);
    event RoundReset(uint256 indexed round);
    event DividendsClaimed(uint256 indexed round, address indexed player, uint256 amount);
    event RoundStarted(uint256 indexed round, uint256 endTime);
    event TimerExtended(uint256 indexed round, uint256 newEndTime, uint256 maxEndTime);
    event PotCapUpdated(uint256 newCap);

    // ============ Constructor ============
    constructor(
        address _clawd,
        uint256 _timerDuration,
        address _dev,
        uint256 _initialPotCap
    ) Ownable(msg.sender) {
        // #7: Constructor validation
        require(_clawd != address(0), "CLAWD address cannot be zero");
        require(_dev != address(0), "Dev address cannot be zero");
        require(_timerDuration > 0, "Timer duration must be > 0");

        clawd = IERC20(_clawd);
        timerDuration = _timerDuration;
        dev = _dev;
        potCap = _initialPotCap;

        currentRound = 1;
        roundStart = block.timestamp;
        roundEnd = block.timestamp + _timerDuration;
        maxEndTime = block.timestamp + MAX_ROUND_LENGTH;

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

    /// @notice Update pot cap for future/current rounds
    function setPotCap(uint256 _newCap) external onlyOwner {
        potCap = _newCap;
        emit PotCapUpdated(_newCap);
    }

    // ============ Core Game ============

    /// @notice Buy keys with CLAWD tokens
    /// @param numKeys Number of keys to buy (1 to MAX_KEYS_PER_BUY)
    function buyKeys(uint256 numKeys) external nonReentrant whenNotPaused {
        require(numKeys > 0 && numKeys <= MAX_KEYS_PER_BUY, "Invalid key count");
        require(block.timestamp < roundEnd, "Round ended");

        // Trial round: check pot cap
        if (potCap > 0) {
            require(pot < potCap, "Pot cap reached, wait for round to end");
        }

        // Calculate cost using bonding curve: sum of (BASE_PRICE + i * INCREMENT) for i = totalKeys..totalKeys+numKeys-1
        uint256 cost = _calculateCost(numKeys);

        // 10% burn on buy
        uint256 burnAmount = (cost * BURN_ON_BUY_BPS) / BPS;
        uint256 toPot = cost - burnAmount;

        // Transfer CLAWD from buyer
        clawd.safeTransferFrom(msg.sender, address(this), cost);

        // Burn
        clawd.safeTransfer(DEAD, burnAmount);
        totalBurned += burnAmount;

        // Add to pot
        pot += toPot;

        // Update player keys
        Player storage player = players[currentRound][msg.sender];
        player.keys += numKeys;
        // Adjust points correction so existing dividends aren't diluted
        player.pointsCorrection -= int256(pointsPerKey * numKeys);

        totalKeys += numKeys;
        lastBuyer = msg.sender;

        // Anti-snipe: extend timer if within threshold, but clamp to maxEndTime (#9)
        if (roundEnd - block.timestamp < ANTI_SNIPE_THRESHOLD) {
            uint256 newEnd = block.timestamp + ANTI_SNIPE_EXTENSION;
            if (newEnd > maxEndTime) {
                newEnd = maxEndTime; // #9: clamp
            }
            if (newEnd > roundEnd) {
                roundEnd = newEnd;
                emit TimerExtended(currentRound, newEnd, maxEndTime);
            }
        }

        emit KeysPurchased(currentRound, msg.sender, numKeys, cost, burnAmount);
    }

    /// @notice End the round and distribute pot
    function endRound() external nonReentrant whenNotPaused {
        require(block.timestamp >= roundEnd, "Round not ended yet");

        // #10: Grace period — only lastBuyer can call in first GRACE_PERIOD seconds
        if (block.timestamp < roundEnd + GRACE_PERIOD) {
            require(msg.sender == lastBuyer || lastBuyer == address(0), "Grace period: only last buyer can end");
        }

        // #11: If no one bought keys, reset the round instead of reverting
        if (lastBuyer == address(0) || totalKeys == 0) {
            _resetRound();
            emit RoundReset(currentRound - 1);
            return;
        }

        uint256 potSize = pot;
        uint256 winnerPayout = (potSize * WINNER_BPS) / BPS;
        uint256 burnPayout = (potSize * BURN_ON_END_BPS) / BPS;
        uint256 dividendsPayout = (potSize * DIVIDENDS_BPS) / BPS;
        uint256 devPayout = (potSize * DEV_BPS) / BPS;

        // #8: Track dust remainder
        uint256 distributed = winnerPayout + burnPayout + dividendsPayout + devPayout;
        uint256 dust = potSize - distributed;
        dividendRemainder += dust;

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
        clawd.safeTransfer(dev, devPayout);

        // Distribute dividends via points-per-share
        if (totalKeys > 0) {
            pointsPerKey += (dividendsPayout * MAGNITUDE) / totalKeys;
        }

        emit RoundEnded(currentRound, lastBuyer, winnerPayout, burnPayout);

        // Start new round
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
        uint256 hardMaxEnd,
        address lastBuyerAddr,
        uint256 keys,
        uint256 keyPrice,
        bool isActive,
        uint256 potCapValue
    ) {
        round = currentRound;
        potSize = pot;
        endTime = roundEnd;
        hardMaxEnd = maxEndTime;
        lastBuyerAddr = lastBuyer;
        keys = totalKeys;
        keyPrice = BASE_PRICE + totalKeys * PRICE_INCREMENT;
        isActive = block.timestamp < roundEnd;
        potCapValue = potCap;
    }

    /// @notice Get round result
    function getRoundResult(uint256 round) external view returns (RoundResult memory) {
        return roundResults[round];
    }

    /// @notice Check if pot cap is reached
    function isPotCapReached() external view returns (bool) {
        if (potCap == 0) return false;
        return pot >= potCap;
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
        int256 totalEarned = int256(pointsPerKey * p.keys) + p.pointsCorrection;
        if (totalEarned < 0) return 0;
        uint256 earned = uint256(totalEarned) / MAGNITUDE;
        if (earned <= p.withdrawnDividends) return 0;
        return earned - p.withdrawnDividends;
    }

    function _startNewRound() internal {
        currentRound++;
        roundStart = block.timestamp;
        roundEnd = block.timestamp + timerDuration;
        maxEndTime = block.timestamp + MAX_ROUND_LENGTH;
        pot = dividendRemainder; // #8: carry forward dust
        dividendRemainder = 0;
        totalKeys = 0;
        lastBuyer = address(0);
        // Note: pointsPerKey persists across rounds for cumulative tracking

        emit RoundStarted(currentRound, roundEnd);
    }

    /// @notice #11: Reset round when no one bought
    function _resetRound() internal {
        currentRound++;
        roundStart = block.timestamp;
        roundEnd = block.timestamp + timerDuration;
        maxEndTime = block.timestamp + MAX_ROUND_LENGTH;
        // pot carries over (if any), no distribution needed
        totalKeys = 0;
        lastBuyer = address(0);

        emit RoundStarted(currentRound, roundEnd);
    }
}

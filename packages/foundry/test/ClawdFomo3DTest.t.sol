// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {ClawdFomo3D} from "../contracts/ClawdFomo3D.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Simple mock ERC20 for testing
contract MockCLAWD is ERC20 {
    constructor() ERC20("CLAWD", "CLAWD") {
        _mint(msg.sender, 100_000_000_000 * 1e18); // 100B supply
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract ClawdFomo3DTest is Test {
    ClawdFomo3D public game;
    MockCLAWD public clawd;

    address public deployer = address(this);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public carol = address(0xCA201);
    address public dev = address(0xDE7);

    uint256 public constant TIMER = 1 hours;
    uint256 public constant POT_CAP = 1_000_000 * 1e18;

    function setUp() public {
        clawd = new MockCLAWD();
        game = new ClawdFomo3D(address(clawd), TIMER, dev, POT_CAP);

        // Fund players
        clawd.transfer(alice, 10_000_000 * 1e18);
        clawd.transfer(bob, 10_000_000 * 1e18);
        clawd.transfer(carol, 10_000_000 * 1e18);

        // Approve game
        vm.prank(alice);
        clawd.approve(address(game), type(uint256).max);
        vm.prank(bob);
        clawd.approve(address(game), type(uint256).max);
        vm.prank(carol);
        clawd.approve(address(game), type(uint256).max);
    }

    // ============ Helpers ============

    function _buyKeys(address player, uint256 numKeys) internal {
        vm.prank(player);
        game.buyKeys(numKeys);
    }

    function _endRound(address caller) internal {
        vm.warp(game.roundEnd() + game.GRACE_PERIOD() + 1);
        vm.prank(caller);
        game.endRound();
    }

    function _endRoundAsLastBuyer() internal {
        address lb = game.lastBuyer();
        vm.warp(game.roundEnd());
        vm.prank(lb);
        game.endRound();
    }

    // ============ Single Round Tests ============

    function test_BuyKeys() public {
        _buyKeys(alice, 10);

        (uint256 keys,,) = game.getPlayer(1, alice);
        assertEq(keys, 10, "Alice should have 10 keys");
        assertEq(game.totalKeys(), 10, "Total keys should be 10");
        assertEq(game.lastBuyer(), alice, "Last buyer should be Alice");
    }

    function test_KeyPriceBondingCurve() public {
        // First key costs BASE_PRICE = 1000 CLAWD
        uint256 price1 = game.currentKeyPrice();
        assertEq(price1, 1000 * 1e18, "First key = 1000 CLAWD");

        _buyKeys(alice, 1);

        // Second key costs 1000 + 10 = 1010
        uint256 price2 = game.currentKeyPrice();
        assertEq(price2, 1010 * 1e18, "Second key = 1010 CLAWD");
    }

    function test_BurnOnBuy() public {
        address dead = game.DEAD();
        uint256 deadBefore = clawd.balanceOf(dead);

        uint256 cost = game.calculateCost(10);
        uint256 expectedBurn = (cost * 1000) / 10000; // 10%

        _buyKeys(alice, 10);

        uint256 deadAfter = clawd.balanceOf(dead);
        assertEq(deadAfter - deadBefore, expectedBurn, "10% should be burned");
    }

    function test_SingleRoundWinnerGetsPot() public {
        _buyKeys(alice, 10);
        _buyKeys(bob, 5);

        uint256 pot = game.pot();
        uint256 expectedWinnerPayout = (pot * 4000) / 10000; // 40%

        uint256 bobBefore = clawd.balanceOf(bob);

        // Bob is last buyer → winner
        _endRoundAsLastBuyer();

        uint256 bobAfter = clawd.balanceOf(bob);
        assertEq(bobAfter - bobBefore, expectedWinnerPayout, "Winner gets 40% of pot");
    }

    function test_SingleRoundDividends() public {
        // Alice buys 100 keys
        _buyKeys(alice, 100);
        // Bob buys 50 keys (after Alice)
        _buyKeys(bob, 50);

        uint256 pot = game.pot();
        uint256 dividendsPayout = (pot * 2500) / 10000; // 25%

        // End round (Bob is last buyer)
        _endRoundAsLastBuyer();

        // Check Alice's dividends
        uint256 alicePending = game.pendingDividends(1, alice);
        // Alice had 100/150 keys when dividends were distributed
        // But Alice bought first so correction was 0
        // Bob bought second, his correction accounts for pre-existing PPK
        // Actually PPK was 0 when Alice bought (first buyer), so correction = 0
        // When Bob bought at key 100+, correction = -(PPK * 50) but PPK was still 0
        // Dividends distributed: PPK += dividendsPayout * MAG / 150
        // Alice owed: (PPK * 100 + 0) / MAG = dividendsPayout * 100 / 150
        uint256 expectedAlice = (dividendsPayout * 100) / 150;
        // Allow for rounding (off by at most 1 due to integer division)
        assertApproxEqAbs(alicePending, expectedAlice, 1, "Alice gets 100/150 of dividends");

        uint256 bobPending = game.pendingDividends(1, bob);
        uint256 expectedBob = (dividendsPayout * 50) / 150;
        assertApproxEqAbs(bobPending, expectedBob, 1, "Bob gets 50/150 of dividends");

        // Claim dividends
        uint256 aliceBefore = clawd.balanceOf(alice);
        vm.prank(alice);
        game.claimDividends(1);
        uint256 aliceAfter = clawd.balanceOf(alice);
        assertApproxEqAbs(aliceAfter - aliceBefore, expectedAlice, 1, "Alice claims correct amount");
    }

    function test_CannotBuyAfterRoundEnd() public {
        _buyKeys(alice, 1);
        vm.warp(game.roundEnd() + 1);

        vm.prank(bob);
        vm.expectRevert("Round ended");
        game.buyKeys(1);
    }

    function test_GracePeriod() public {
        _buyKeys(alice, 1);
        vm.warp(game.roundEnd());

        // Non-lastBuyer can't end during grace period
        vm.prank(bob);
        vm.expectRevert("Grace period: only last buyer can end");
        game.endRound();

        // Last buyer can
        vm.prank(alice);
        game.endRound();
    }

    // ============ Multi-Round: Cross-Round Dividend Leakage Test ============

    function test_NoCrossRoundDividendLeakage() public {
        // === ROUND 1 ===
        // Alice buys 100 keys
        _buyKeys(alice, 100);

        uint256 pot1 = game.pot();
        uint256 dividends1 = (pot1 * 2500) / 10000;

        // End round 1 (Alice is last buyer → winner)
        _endRoundAsLastBuyer();

        // Alice's R1 dividends should be all of dividends1 (she's the only key holder)
        uint256 aliceR1Pending = game.pendingDividends(1, alice);
        assertApproxEqAbs(aliceR1Pending, dividends1, 1, "R1: Alice gets all dividends");

        // === ROUND 2 ===
        assertEq(game.currentRound(), 2, "Should be round 2");

        // Bob buys 50 keys in round 2
        _buyKeys(bob, 50);

        uint256 pot2 = game.pot();
        uint256 dividends2 = (pot2 * 2500) / 10000;

        // End round 2
        _endRoundAsLastBuyer();

        // THE CRITICAL CHECK: Alice's R1 dividends should NOT have changed
        uint256 aliceR1PendingAfterR2 = game.pendingDividends(1, alice);
        assertApproxEqAbs(
            aliceR1PendingAfterR2,
            dividends1,
            1,
            "CRITICAL: Alice's R1 dividends must not increase after R2"
        );

        // Bob's R2 dividends should be all of dividends2 (he's the only R2 key holder)
        uint256 bobR2Pending = game.pendingDividends(2, bob);
        assertApproxEqAbs(bobR2Pending, dividends2, 1, "R2: Bob gets all dividends");

        // Alice should have 0 dividends for round 2 (she didn't buy R2 keys)
        uint256 aliceR2Pending = game.pendingDividends(2, alice);
        assertEq(aliceR2Pending, 0, "Alice has no R2 keys, no R2 dividends");

        // Bob should have 0 dividends for round 1 (he didn't buy R1 keys)
        uint256 bobR1Pending = game.pendingDividends(1, bob);
        assertEq(bobR1Pending, 0, "Bob has no R1 keys, no R1 dividends");
    }

    function test_MultiRoundSolvency() public {
        // This is the audit's exact proof-by-example scenario

        // Round 1: Alice buys 100 keys
        _buyKeys(alice, 100);
        uint256 pot1 = game.pot();
        uint256 dividends1 = (pot1 * 2500) / 10000;
        _endRoundAsLastBuyer();

        // Round 2: Bob buys 50 keys
        _buyKeys(bob, 50);
        uint256 pot2 = game.pot();
        uint256 dividends2 = (pot2 * 2500) / 10000;
        _endRoundAsLastBuyer();

        // Total dividends in contract should cover all claims
        uint256 aliceOwed = game.pendingDividends(1, alice);
        uint256 bobOwed = game.pendingDividends(2, bob);

        // Contract balance should be >= total owed
        uint256 contractBalance = clawd.balanceOf(address(game));
        assertTrue(
            contractBalance >= aliceOwed + bobOwed,
            "SOLVENCY: Contract must have enough to pay all dividends"
        );

        // Claim both and verify no revert
        vm.prank(alice);
        game.claimDividends(1);
        vm.prank(bob);
        game.claimDividends(2);
    }

    function test_ThreeRoundsSolvency() public {
        // Round 1: Alice buys 100 keys
        _buyKeys(alice, 100);
        _endRoundAsLastBuyer();

        // Round 2: Bob buys 50 keys
        _buyKeys(bob, 50);
        _endRoundAsLastBuyer();

        // Round 3: Carol buys 200 keys
        _buyKeys(carol, 200);
        _endRoundAsLastBuyer();

        // All should be claimable
        uint256 aliceOwed = game.pendingDividends(1, alice);
        uint256 bobOwed = game.pendingDividends(2, bob);
        uint256 carolOwed = game.pendingDividends(3, carol);

        uint256 contractBalance = clawd.balanceOf(address(game));
        assertTrue(
            contractBalance >= aliceOwed + bobOwed + carolOwed,
            "SOLVENCY: 3 rounds all claimable"
        );

        // Claims don't revert
        vm.prank(alice);
        game.claimDividends(1);
        vm.prank(bob);
        game.claimDividends(2);
        vm.prank(carol);
        game.claimDividends(3);

        // No cross-contamination
        assertEq(game.pendingDividends(1, bob), 0, "Bob has no R1 dividends");
        assertEq(game.pendingDividends(1, carol), 0, "Carol has no R1 dividends");
        assertEq(game.pendingDividends(2, alice), 0, "Alice has no R2 dividends");
        assertEq(game.pendingDividends(2, carol), 0, "Carol has no R2 dividends");
        assertEq(game.pendingDividends(3, alice), 0, "Alice has no R3 dividends");
        assertEq(game.pendingDividends(3, bob), 0, "Bob has no R3 dividends");
    }

    // ============ Edge Cases ============

    function test_SinglePlayerRound() public {
        _buyKeys(alice, 10);
        uint256 pot = game.pot();
        uint256 expectedWinner = (pot * 4000) / 10000;
        uint256 expectedDividends = (pot * 2500) / 10000;

        uint256 aliceBefore = clawd.balanceOf(alice);
        _endRoundAsLastBuyer();

        // Alice wins as last buyer
        uint256 aliceAfterWin = clawd.balanceOf(alice);
        assertEq(aliceAfterWin - aliceBefore, expectedWinner, "Single player wins pot");

        // Alice also gets all dividends
        uint256 aliceDivs = game.pendingDividends(1, alice);
        assertApproxEqAbs(aliceDivs, expectedDividends, 1, "Single player gets all dividends");
    }

    function test_RoundResetNoPlayers() public {
        // Nobody buys, round ends
        vm.warp(game.roundEnd() + game.GRACE_PERIOD() + 1);
        game.endRound();

        // Should be round 2 now
        assertEq(game.currentRound(), 2, "Reset creates round 2");
        assertEq(game.totalKeys(), 0, "No keys");
        assertEq(game.lastBuyer(), address(0), "No last buyer");
    }

    function test_WithdrawalPreventsDoubleClaim() public {
        _buyKeys(alice, 100);
        _endRoundAsLastBuyer();

        uint256 divs = game.pendingDividends(1, alice);
        assertTrue(divs > 0, "Has dividends");

        vm.prank(alice);
        game.claimDividends(1);

        // Second claim should fail
        vm.prank(alice);
        vm.expectRevert("No dividends");
        game.claimDividends(1);
    }

    function test_AntiSnipeExtension() public {
        _buyKeys(alice, 1);

        // Warp to 1 minute before end (within ANTI_SNIPE_THRESHOLD = 2 min)
        vm.warp(game.roundEnd() - 60);
        uint256 endBefore = game.roundEnd();

        _buyKeys(bob, 1);

        uint256 endAfter = game.roundEnd();
        assertTrue(endAfter > endBefore, "Timer extended by anti-snipe");
    }

    function test_MultiPlayerDividendSplit() public {
        // Alice buys 100 keys
        _buyKeys(alice, 100);
        // Bob buys 100 keys — should get equal share since PPK was 0 when both bought
        // Wait, Alice buys first so PPK=0, then Bob buys and PPK still 0
        // Both get correction = 0. When dividends distributed, PPK set.
        // Alice: (PPK * 100 + 0) / MAG
        // Bob: (PPK * 100 + 0) / MAG
        // Actually no — Bob's correction is -(PPK * 100) where PPK was 0 at time of buy = 0
        // So both get PPK * 100 / MAG = dividends * 100/200 = 50% each
        _buyKeys(bob, 100);

        _endRoundAsLastBuyer();

        uint256 aliceDivs = game.pendingDividends(1, alice);
        uint256 bobDivs = game.pendingDividends(1, bob);

        // Should be approximately equal (same number of keys)
        assertApproxEqAbs(aliceDivs, bobDivs, 1, "Equal keys = equal dividends");
    }

    function test_PlayerBuysAcrossMultipleRounds() public {
        // Alice plays Round 1
        _buyKeys(alice, 100);
        _endRoundAsLastBuyer();

        uint256 aliceR1Divs = game.pendingDividends(1, alice);

        // Alice also plays Round 2
        _buyKeys(alice, 50);
        _buyKeys(bob, 50);
        _endRoundAsLastBuyer();

        // R1 dividends unchanged
        assertApproxEqAbs(
            game.pendingDividends(1, alice),
            aliceR1Divs,
            1,
            "R1 dividends unchanged after R2"
        );

        // R2 dividends: Alice has 50/100 = 50%
        uint256 aliceR2Divs = game.pendingDividends(2, alice);
        uint256 bobR2Divs = game.pendingDividends(2, bob);
        assertApproxEqAbs(aliceR2Divs, bobR2Divs, 1, "Equal R2 keys = equal R2 dividends");
    }

    function test_DevGetsPayout() public {
        _buyKeys(alice, 10);
        uint256 pot = game.pot();
        uint256 expectedDev = (pot * 500) / 10000; // 5%

        uint256 devBefore = clawd.balanceOf(dev);
        _endRoundAsLastBuyer();
        uint256 devAfter = clawd.balanceOf(dev);

        assertEq(devAfter - devBefore, expectedDev, "Dev gets 5%");
    }

    function test_BurnOnRoundEnd() public {
        _buyKeys(alice, 10);
        uint256 pot = game.pot();
        uint256 expectedBurn = (pot * 3000) / 10000; // 30%

        address dead = game.DEAD();
        uint256 deadBefore = clawd.balanceOf(dead);
        _endRoundAsLastBuyer();
        uint256 deadAfter = clawd.balanceOf(dead);

        assertEq(deadAfter - deadBefore, expectedBurn, "30% burned at round end");
    }

    function test_PotCapEnforced() public {
        // Buy until we hit the pot cap
        // Use try/catch to find when cap is reached
        bool capHit = false;
        for (uint256 i = 0; i < 100; i++) {
            if (game.isPotCapReached()) {
                capHit = true;
                break;
            }
            _buyKeys(alice, 100);
        }
        assertTrue(capHit, "Pot cap should have been reached");

        // Now verify buying is blocked
        vm.prank(bob);
        vm.expectRevert("Pot cap reached, wait for round to end");
        game.buyKeys(1);
    }

    function test_PauseBlocks() public {
        game.pause();

        vm.prank(alice);
        vm.expectRevert();
        game.buyKeys(1);

        game.unpause();

        // Now it works
        _buyKeys(alice, 1);
    }

    function test_PointsPerKeyResetsEachRound() public {
        // Round 1
        _buyKeys(alice, 100);
        _endRoundAsLastBuyer();

        // After round 1 ends, pointsPerKey should be 0 (reset in _startNewRound)
        assertEq(game.pointsPerKey(), 0, "PPK reset to 0 after round end");

        // Round 2
        _buyKeys(bob, 50);
        _endRoundAsLastBuyer();

        // After round 2 ends, pointsPerKey should be 0 again
        assertEq(game.pointsPerKey(), 0, "PPK reset to 0 after round 2 end");

        // Snapshots should be non-zero
        assertTrue(game.roundPointsPerKey(1) > 0, "R1 snapshot non-zero");
        assertTrue(game.roundPointsPerKey(2) > 0, "R2 snapshot non-zero");
    }
}

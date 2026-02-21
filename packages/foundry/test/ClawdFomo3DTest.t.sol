// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {ClawdFomo3D} from "../contracts/ClawdFomo3D.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Simple mock ERC20 for testing
contract MockCLAWD is ERC20 {
    constructor() ERC20("CLAWD", "CLAWD") {
        _mint(msg.sender, 100_000_000_000 * 1e18);
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

    uint256 public constant TIMER = 10 minutes;

    function setUp() public {
        clawd = new MockCLAWD();
        game = new ClawdFomo3D(address(clawd), TIMER);

        clawd.transfer(alice, 10_000_000 * 1e18);
        clawd.transfer(bob, 10_000_000 * 1e18);
        clawd.transfer(carol, 10_000_000 * 1e18);

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

    function _endRound() internal {
        vm.warp(game.roundEnd());
        game.endRound();
    }

    /// @dev End round + warp past cooldown + start next round
    function _endRoundAndStartNext() internal {
        _endRound();
        vm.warp(game.roundCooldownEnd());
        game.startNextRound();
    }

    // ============ Basic Tests ============

    function test_BuyKeys() public {
        _buyKeys(alice, 10);

        (uint256 keys,,) = game.getPlayer(1, alice);
        assertEq(keys, 10);
        assertEq(game.totalKeys(), 10);
        assertEq(game.lastBuyer(), alice);
    }

    function test_KeyPriceBondingCurve() public {
        uint256 price1 = game.currentKeyPrice();
        assertEq(price1, 1000 * 1e18);

        _buyKeys(alice, 1);

        uint256 price2 = game.currentKeyPrice();
        assertEq(price2, 1110 * 1e18);
    }

    function test_BurnOnBuy() public {
        address dead = game.DEAD();
        uint256 deadBefore = clawd.balanceOf(dead);

        uint256 cost = game.calculateCost(10);
        uint256 expectedBurn = (cost * 500) / 10000; // 5%

        _buyKeys(alice, 10);

        uint256 deadAfter = clawd.balanceOf(dead);
        assertEq(deadAfter - deadBefore, expectedBurn, "5% should be burned");
    }

    function test_SingleRoundWinnerGetsPot() public {
        _buyKeys(alice, 10);
        _buyKeys(bob, 5);

        uint256 pot = game.pot();
        uint256 expectedWinnerPayout = (pot * 5500) / 10000; // 55%

        uint256 bobBefore = clawd.balanceOf(bob);
        _endRound();
        uint256 bobAfter = clawd.balanceOf(bob);
        assertEq(bobAfter - bobBefore, expectedWinnerPayout, "Winner gets 55% of pot");
    }

    function test_SingleRoundDividends() public {
        _buyKeys(alice, 100);
        _buyKeys(bob, 50);

        _endRound();

        uint256 alicePending = game.pendingDividends(1, alice);
        uint256 bobPending = game.pendingDividends(1, bob);

        assertTrue(alicePending > 0, "Alice has dividends");
        assertTrue(bobPending > 0, "Bob has dividends");
        assertTrue(alicePending > bobPending, "Early buyer earns more");

        uint256 aliceBefore = clawd.balanceOf(alice);
        vm.prank(alice);
        game.claimDividends(1);
        uint256 aliceAfter = clawd.balanceOf(alice);
        assertEq(aliceAfter - aliceBefore, alicePending);

        vm.prank(bob);
        game.claimDividends(1);
    }

    function test_CannotBuyAfterRoundEnd() public {
        _buyKeys(alice, 1);
        vm.warp(game.roundEnd() + 1);

        vm.prank(bob);
        vm.expectRevert("Round ended");
        game.buyKeys(1);
    }

    // ============ Cooldown Tests ============

    function test_CooldownStartsAfterEndRound() public {
        _buyKeys(alice, 10);
        _endRound();

        assertTrue(game.inCooldown(), "Should be in cooldown");
        assertEq(game.roundCooldownEnd(), block.timestamp + 32 hours);
    }

    function test_CannotBuyDuringCooldown() public {
        _buyKeys(alice, 10);
        _endRound();

        vm.prank(bob);
        vm.expectRevert("In cooldown");
        game.buyKeys(1);
    }

    function test_CannotStartNextRoundBeforeCooldown() public {
        _buyKeys(alice, 10);
        _endRound();

        vm.warp(game.roundCooldownEnd() - 1);
        vm.expectRevert("Cooldown not over");
        game.startNextRound();
    }

    function test_StartNextRoundAfterCooldown() public {
        _buyKeys(alice, 10);
        _endRound();

        vm.warp(game.roundCooldownEnd());
        game.startNextRound();

        assertFalse(game.inCooldown(), "No longer in cooldown");
        assertEq(game.currentRound(), 2);
        assertEq(game.totalKeys(), 0);
    }

    function test_StartNextRoundPermissionless() public {
        _buyKeys(alice, 10);
        _endRound();
        vm.warp(game.roundCooldownEnd());

        // Bob (random person) can start it
        vm.prank(bob);
        game.startNextRound();

        assertEq(game.currentRound(), 2);
    }

    function test_CannotEndRoundDuringCooldown() public {
        _buyKeys(alice, 10);
        _endRound();

        vm.expectRevert("Already in cooldown");
        game.endRound();
    }

    function test_CooldownOnEmptyRound() public {
        // Nobody buys, round ends
        vm.warp(game.roundEnd());
        game.endRound();

        assertTrue(game.inCooldown(), "Empty round enters cooldown too");
        vm.warp(game.roundCooldownEnd());
        game.startNextRound();
        assertEq(game.currentRound(), 2);
    }

    // ============ Multi-Round with Cooldown ============

    function test_NoCrossRoundDividendLeakage() public {
        _buyKeys(alice, 100);
        uint256 pot1 = game.pot();
        uint256 dividends1 = (pot1 * 2500) / 10000;

        _endRoundAndStartNext();

        uint256 aliceR1Pending = game.pendingDividends(1, alice);
        assertApproxEqAbs(aliceR1Pending, dividends1, 1);

        assertEq(game.currentRound(), 2);
        _buyKeys(bob, 50);
        uint256 pot2 = game.pot();
        uint256 dividends2 = (pot2 * 2500) / 10000;

        _endRoundAndStartNext();

        // Alice R1 dividends unchanged
        uint256 aliceR1After = game.pendingDividends(1, alice);
        assertApproxEqAbs(aliceR1After, dividends1, 1, "R1 dividends unchanged");

        uint256 bobR2 = game.pendingDividends(2, bob);
        assertApproxEqAbs(bobR2, dividends2, 1);

        assertEq(game.pendingDividends(2, alice), 0, "Alice no R2 dividends");
        assertEq(game.pendingDividends(1, bob), 0, "Bob no R1 dividends");
    }

    function test_MultiRoundSolvency() public {
        _buyKeys(alice, 100);
        _endRoundAndStartNext();

        _buyKeys(bob, 50);
        _endRoundAndStartNext();

        uint256 aliceOwed = game.pendingDividends(1, alice);
        uint256 bobOwed = game.pendingDividends(2, bob);

        uint256 contractBalance = clawd.balanceOf(address(game));
        assertTrue(contractBalance >= aliceOwed + bobOwed, "Solvent");

        vm.prank(alice);
        game.claimDividends(1);
        vm.prank(bob);
        game.claimDividends(2);
    }

    function test_ThreeRoundsSolvency() public {
        _buyKeys(alice, 100);
        _endRoundAndStartNext();

        _buyKeys(bob, 50);
        _endRoundAndStartNext();

        _buyKeys(carol, 200);
        _endRoundAndStartNext();

        uint256 aliceOwed = game.pendingDividends(1, alice);
        uint256 bobOwed = game.pendingDividends(2, bob);
        uint256 carolOwed = game.pendingDividends(3, carol);

        uint256 contractBalance = clawd.balanceOf(address(game));
        assertTrue(contractBalance >= aliceOwed + bobOwed + carolOwed, "3-round solvency");

        vm.prank(alice);
        game.claimDividends(1);
        vm.prank(bob);
        game.claimDividends(2);
        vm.prank(carol);
        game.claimDividends(3);

        assertEq(game.pendingDividends(1, bob), 0);
        assertEq(game.pendingDividends(2, alice), 0);
        assertEq(game.pendingDividends(3, alice), 0);
    }

    // ============ Edge Cases ============

    function test_SinglePlayerRound() public {
        _buyKeys(alice, 10);
        uint256 pot = game.pot();
        uint256 expectedWinner = (pot * 5500) / 10000; // 55%
        uint256 expectedDividends = (pot * 2500) / 10000;

        uint256 aliceBefore = clawd.balanceOf(alice);
        _endRound();
        uint256 aliceAfter = clawd.balanceOf(alice);
        assertEq(aliceAfter - aliceBefore, expectedWinner);

        uint256 aliceDivs = game.pendingDividends(1, alice);
        assertApproxEqAbs(aliceDivs, expectedDividends, 1);
    }

    function test_WithdrawalPreventsDoubleClaim() public {
        _buyKeys(alice, 100);
        _endRound();

        uint256 divs = game.pendingDividends(1, alice);
        assertTrue(divs > 0);

        vm.prank(alice);
        game.claimDividends(1);

        vm.prank(alice);
        vm.expectRevert("No dividends");
        game.claimDividends(1);
    }

    function test_AntiSnipeExtension() public {
        _buyKeys(alice, 1);

        vm.warp(game.roundEnd() - 60);
        uint256 endBefore = game.roundEnd();

        _buyKeys(bob, 1);

        uint256 endAfter = game.roundEnd();
        assertTrue(endAfter > endBefore, "Timer extended");
    }

    function test_MultiPlayerDividendSplit() public {
        _buyKeys(alice, 100);
        _buyKeys(bob, 100);

        _endRound();

        uint256 aliceDivs = game.pendingDividends(1, alice);
        uint256 bobDivs = game.pendingDividends(1, bob);

        assertTrue(aliceDivs > bobDivs, "First buyer earns more");
        assertTrue(bobDivs > 0);

        vm.prank(alice);
        game.claimDividends(1);
        vm.prank(bob);
        game.claimDividends(1);
    }

    function test_PerBuyDividendsDuringRound() public {
        _buyKeys(alice, 10);
        assertEq(game.pendingDividends(1, alice), 0, "No dividends yet");

        _buyKeys(bob, 5);
        uint256 aliceDivsAfterBob = game.pendingDividends(1, alice);
        assertTrue(aliceDivsAfterBob > 0, "Alice earns per-buy dividends");
        assertEq(game.pendingDividends(1, bob), 0, "Bob has no dividends yet");

        _buyKeys(carol, 5);
        uint256 aliceDivsAfterCarol = game.pendingDividends(1, alice);
        uint256 bobDivsAfterCarol = game.pendingDividends(1, bob);
        assertTrue(aliceDivsAfterCarol > aliceDivsAfterBob);
        assertTrue(bobDivsAfterCarol > 0);

        vm.prank(alice);
        game.claimDividends(1);
        vm.prank(bob);
        game.claimDividends(1);
    }

    function test_NextRoundSeed() public {
        _buyKeys(alice, 10);
        uint256 potBefore = game.pot();
        uint256 expectedSeed = (potBefore * 1000) / 10000; // 10%

        _endRoundAndStartNext();

        uint256 newPot = game.pot();
        assertTrue(newPot >= expectedSeed, "Next round pot includes seed");

        uint256 dust = potBefore - (potBefore * 5500 / 10000) - (potBefore * 1000 / 10000) - (potBefore * 2500 / 10000) - (potBefore * 1000 / 10000);
        assertEq(newPot, expectedSeed + dust, "Next round pot = seed + dust");
    }

    function test_BurnOnRoundEnd() public {
        _buyKeys(alice, 10);
        uint256 pot = game.pot();
        uint256 expectedBurn = (pot * 1000) / 10000; // 10%

        address dead = game.DEAD();
        uint256 deadBefore = clawd.balanceOf(dead);
        _endRound();
        uint256 deadAfter = clawd.balanceOf(dead);
        assertEq(deadAfter - deadBefore, expectedBurn, "10% burned at round end");
    }

    function test_PauseBlocks() public {
        game.pause();

        vm.prank(alice);
        vm.expectRevert();
        game.buyKeys(1);

        game.unpause();
        _buyKeys(alice, 1);
    }

    function test_PointsPerKeyResetsEachRound() public {
        _buyKeys(alice, 100);
        _endRoundAndStartNext();

        assertEq(game.pointsPerKey(), 0, "PPK reset after round end");

        _buyKeys(bob, 50);
        _endRoundAndStartNext();

        assertEq(game.pointsPerKey(), 0, "PPK reset after round 2 end");

        assertTrue(game.roundPointsPerKey(1) > 0);
        assertTrue(game.roundPointsPerKey(2) > 0);
    }

    function test_PlayerBuysAcrossMultipleRounds() public {
        _buyKeys(alice, 100);
        _endRoundAndStartNext();

        uint256 aliceR1Divs = game.pendingDividends(1, alice);

        _buyKeys(alice, 50);
        _buyKeys(bob, 50);
        _endRoundAndStartNext();

        assertApproxEqAbs(game.pendingDividends(1, alice), aliceR1Divs, 1, "R1 unchanged");

        uint256 aliceR2 = game.pendingDividends(2, alice);
        uint256 bobR2 = game.pendingDividends(2, bob);
        assertTrue(aliceR2 > bobR2, "First buyer earns more in R2");
        assertTrue(bobR2 > 0);

        vm.prank(alice);
        game.claimDividends(2);
        vm.prank(bob);
        game.claimDividends(2);
    }

    // ============ Batch Read Tests ============

    function test_GetRoundCount() public {
        assertEq(game.getRoundCount(), 1);

        _buyKeys(alice, 10);
        _endRoundAndStartNext();
        assertEq(game.getRoundCount(), 2);
    }

    function test_GetLatestRoundsBasic() public {
        ClawdFomo3D.RoundResultFull[] memory empty = game.getLatestRounds(10);
        assertEq(empty.length, 0);

        _buyKeys(alice, 10);
        _endRoundAndStartNext();
        _buyKeys(bob, 20);
        _endRoundAndStartNext();
        _buyKeys(carol, 30);
        _endRoundAndStartNext();

        ClawdFomo3D.RoundResultFull[] memory results = game.getLatestRounds(10);
        assertEq(results.length, 3);
        assertEq(results[0].roundId, 3);
        assertEq(results[1].roundId, 2);
        assertEq(results[2].roundId, 1);
        assertEq(results[0].winner, carol);
        assertEq(results[1].winner, bob);
        assertEq(results[2].winner, alice);

        for (uint256 i = 0; i < 3; i++) {
            assertEq(results[i].dividendsPayout, (results[i].potSize * 2500) / 10000);
            assertEq(results[i].seedAmount, (results[i].potSize * 1000) / 10000);
        }
    }

    function test_GetRoundInfoIncludesCooldown() public {
        _buyKeys(alice, 10);
        
        (,,,,,,bool isActive, bool cooldown,) = game.getRoundInfo();
        assertTrue(isActive);
        assertFalse(cooldown);

        _endRound();

        (,,,,,,bool isActive2, bool cooldown2, uint256 cooldownEnd) = game.getRoundInfo();
        assertFalse(isActive2);
        assertTrue(cooldown2);
        assertTrue(cooldownEnd > block.timestamp);
    }
}

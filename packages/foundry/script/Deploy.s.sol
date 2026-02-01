// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DeployHelpers.s.sol";
import "../contracts/ClawdFomo3D.sol";

contract DeployScript is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        // CLAWD token address on Base
        address clawdToken = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;
        // Timer: 5 minutes (300 seconds)
        uint256 timerDuration = 5 minutes;
        // Trial round pot cap: 1M CLAWD (18 decimals)
        uint256 initialPotCap = 1_000_000 * 1e18;

        ClawdFomo3D game = new ClawdFomo3D(
            clawdToken,
            timerDuration,
            initialPotCap
        );

        console.logString(
            string.concat(
                "ClawdFomo3D deployed at: ",
                vm.toString(address(game))
            )
        );

        deployments.push(Deployment("ClawdFomo3D", address(game)));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DeployHelpers.s.sol";
import "../contracts/ClawdFomo3D.sol";

contract DeployScript is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        // CLAWD token address on Base
        address clawdToken = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;
        // Dev address (deployer wallet)
        address devAddr = deployer;
        // Timer: 1 hour (3600 seconds)
        uint256 timerDuration = 1 hours;
        // Trial round pot cap: 1M CLAWD (18 decimals)
        uint256 initialPotCap = 1_000_000 * 1e18;

        ClawdFomo3D game = new ClawdFomo3D(
            clawdToken,
            timerDuration,
            devAddr,
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

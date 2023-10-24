// SPDX-License-Identifier: BSL-1.1
pragma solidity 0.6.12;

interface IFetcher {
    function fetch(uint256 ORACLE) external view returns (uint256 twap, uint256 spot);
}

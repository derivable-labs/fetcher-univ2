// SPDX-License-Identifier: MIT
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "../FetcherV2.sol";

contract FetcherV2Mock is FetcherV2 {
    function submitPrice(
        uint256 ORACLE,
        uint256 basePriceCumulative,
        uint256 blockNumber,
        uint256 timestamp
    ) public {
        s_basePriceCumulative[ORACLE] = basePriceCumulative;
        s_lastTimestamp[ORACLE] = timestamp;
        s_lastSubmitBlockNumber[ORACLE] = blockNumber;
    }
}
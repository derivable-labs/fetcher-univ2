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
        uint32 window = uint32(ORACLE >> 192);
        require(blockNumber >= block.number - window, "OLD_PROOF");
        require(blockNumber <= block.number - (window >> 1), "NEW_PROOF");
        s_lastSubmitBlockNumber[ORACLE] = blockNumber;
        
        require(s_lastTimestamp[ORACLE] < timestamp, "EXIST");
        s_lastTimestamp[ORACLE] = timestamp;

        require(s_basePriceCumulative[ORACLE] < basePriceCumulative, "INVALID_PRICE");
        s_basePriceCumulative[ORACLE] = basePriceCumulative;
    }
}
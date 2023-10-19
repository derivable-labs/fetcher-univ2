// SPDX-License-Identifier: MIT
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "../FetcherV2.sol";

contract FetcherV2Mock is FetcherV2 {
    function submitPrice(
        uint256 ORACLE,
        uint256 basePriceCumulative,
        uint256 proofBlock,
        uint256 dataTime
    ) public {
        uint32 window = uint32(ORACLE >> 192);
        require(proofBlock >= block.number - window, "OLD_PROOF");
        require(proofBlock <= block.number - (window >> 1), "NEW_PROOF");
        s_store[ORACLE].proofBlock = uint64(proofBlock);
        
        require(s_store[ORACLE].dataTime <= dataTime, "OLD_DATA");
        s_store[ORACLE].dataTime = uint128(dataTime);

        require(s_store[ORACLE].basePriceCumulative < basePriceCumulative, "INVALID_PRICE");
        s_store[ORACLE].basePriceCumulative = basePriceCumulative;
    }
}
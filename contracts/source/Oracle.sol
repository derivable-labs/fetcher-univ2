// SPDX-License-Identifier: MIT 
pragma solidity ^0.6.12;

library Oracle {
    struct Observation {
        // the block timestamp of the observation
        uint32 blockTimestamp;
        uint256 price;
        uint64 proofBlock;
        uint128 dataTime;
    }

    function write(
        Observation[30] storage self,
        uint16 index,
        uint32 blockTimestamp,
        uint256 price,
        uint64 proofBlock,
        uint128 dataTime
    ) internal returns (uint16 indexUpdated) {
        Observation memory last = self[index];
        if (last.blockTimestamp == blockTimestamp) return index;
        indexUpdated = (index + 1) % 30;
        self[indexUpdated] = Observation({
            blockTimestamp: blockTimestamp,
            price: price,
            proofBlock: proofBlock,
            dataTime: dataTime
        });
    }
}
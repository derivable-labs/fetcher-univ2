// SPDX-License-Identifier: MIT 
pragma solidity ^0.6.12;

library Oracle {
    struct Slot {
        bool lock;
        uint64 proofBlock;
        uint128 dataTime;
        uint256 basePriceCumulative;
        bool initialized;
    }

    function init(
        Slot[65535] storage self,
        uint256 price,
        uint64 proofBlock,
        uint128 dataTime
    ) internal returns (uint16) {
        self[0] = Slot({
            lock: false,
            proofBlock: proofBlock,
            dataTime: dataTime,
            basePriceCumulative: price,
            initialized: true
        });
        return 0;
    }

    function write(
        Slot[65535] storage self,
        uint16 index,
        uint256 price,
        uint64 proofBlock,
        uint128 dataTime,
        uint16 cardinality
    ) internal returns (uint16 indexUpdated) {
        if (index == 0 && !self[0].initialized) return init(self, price, proofBlock, dataTime);
        Slot memory last = self[index];
        if (last.proofBlock == proofBlock) return index;
        indexUpdated = (index + 1) % cardinality;
        self[indexUpdated] = Slot({
            lock: false,
            proofBlock: proofBlock,
            dataTime: dataTime,
            basePriceCumulative: price,
            initialized: true
        });
    }

    // function find the observation index using binary search with below conditions:
    // proofBlock is the newest one that is smaller than (block.number - window)
    // and revert if no observation index found
    function find(
        Slot[65535] storage self,
        uint64 window,
        uint16 cardinality
    ) internal view returns (uint16 index) {
        uint start = 0;
        uint end = cardinality;
        uint lastValid = 0;

        while (start <= end) {
            uint mid = start + (end - start) / 2;
            // If the middle element is less than (block.number - window), update the result and move the start index
            if (self[mid].proofBlock <= block.number - window && self[mid].initialized) {
                lastValid = self[mid].proofBlock;
                index = uint16(mid);
                start = mid + 1;
            } else {
                end = mid - 1;
            }
        }
        require(
            lastValid != 0,
            "NOT_FOUND"
        );
    }
}
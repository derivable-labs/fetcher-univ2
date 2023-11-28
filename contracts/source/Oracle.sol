// SPDX-License-Identifier: MIT 
pragma solidity ^0.6.12;

library Oracle {
    struct Observation {
        uint256 price;
        uint64 proofBlock;
        uint128 dataTime;
        bool initialized;
    }

    function init(
        Observation[30] storage self,
        uint256 price,
        uint64 proofBlock,
        uint128 dataTime
    ) internal returns (uint16) {
        self[0] = Observation({
            price: price,
            proofBlock: proofBlock,
            dataTime: dataTime,
            initialized: true
        });
        return 0;
    }

    function write(
        Observation[30] storage self,
        uint16 index,
        uint256 price,
        uint64 proofBlock,
        uint128 dataTime
    ) internal returns (uint16 indexUpdated) {
        if (index == 0 && !self[0].initialized) return init(self, price, proofBlock, dataTime);
        Observation memory last = self[index];
        if (last.proofBlock == proofBlock) return index;
        indexUpdated = (index + 1) % 30;
        self[indexUpdated] = Observation({
            price: price,
            proofBlock: proofBlock,
            dataTime: dataTime,
            initialized: true
        });
    }

    // function find the observation index using binary search with below conditions:
    // proofBlock is the newest one that is smaller than (block.number - window)
    // and revert if no observation index found
    function find(
        Observation[30] storage self,
        uint64 window
    ) internal view returns (uint16 index) {
        uint start = 0;
        uint end = 29;
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
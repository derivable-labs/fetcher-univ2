// SPDX-License-Identifier: MIT 
pragma solidity ^0.6.12;

library Oracle {
    struct Observation {
        uint256 price;
        uint64 proofBlock;
        uint128 dataTime;
        bool initialized;
    }

    function write(
        Observation[30] storage self,
        uint16 index,
        uint256 price,
        uint64 proofBlock,
        uint128 dataTime
    ) internal returns (uint16 indexUpdated) {
        if (!self[0].initialized) {
            self[0] = Observation({
                price: price,
                proofBlock: proofBlock,
                dataTime: dataTime,
                initialized: true
            });
            return 0;
        }
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

    // function find the observation index with below conditions:
    // proofBlock is the biggest one that is smaller than (block.number - window)
    // and revert if no observation index found
    function find(
        Observation[30] storage self,
        uint32 window
    ) internal view returns (uint16 index) {
        uint64 lastValid = 0;
        for (uint16 i = 0; i < 30; i++) {
            if (self[i].proofBlock <= (block.number - window) && self[i].proofBlock > lastValid) {
                lastValid = self[i].proofBlock;
                index = i;
            }
        }
        require(
            lastValid != 0,
            "NOT_FOUND"
        );
    }
}
// SPDX-License-Identifier: MIT
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@keydonix/uniswap-oracle-contracts/source/MerklePatriciaVerifier.sol";
import "@keydonix/uniswap-oracle-contracts/source/Rlp.sol";
import "@keydonix/uniswap-oracle-contracts/source/BlockVerifier.sol";
import "./source/FullMath.sol";
import "./source/UniswapV2OracleLibrary.sol";

contract FetcherV2 {
    uint256 internal constant Q128 = 1 << 128;
	bytes32 internal constant RESERVE_TIMESTAMP_SLOT_HASH = keccak256(abi.encodePacked(uint256(8)));
	bytes32 internal constant PRICE_CUMULATIVE_0_SLOT_HASH = keccak256(abi.encodePacked(uint256(9)));
	bytes32 internal constant PRICE_CUMULATIVE_1_SLOT_HASH = keccak256(abi.encodePacked(uint256(10)));

    mapping(uint256 => uint256) s_basePriceCumulative;
    mapping(uint256 => uint256) s_lastTimestamp;

    struct ProofData {
        bytes block;
        bytes accountProofNodesRlp;
        bytes reserveAndTimestampProofNodesRlp;
        bytes priceAccumulatorProofNodesRlp;
    }

    function fetch(
        uint256 ORACLE
    ) external virtual view returns (uint256 twap, uint256 spot) {
        uint32 window = uint32(ORACLE >> 192);
        uint lastTimestamp = s_lastTimestamp[ORACLE];
        require(lastTimestamp + window >= block.timestamp, "OLD");
        require(lastTimestamp + (window >> 1) <= block.timestamp, "NEW");

        address pair = address(uint160(ORACLE));
        uint256 qti = ORACLE >> 255;

        (uint basePriceCumulative, uint blockTimestamp) = UniswapV2OracleLibrary
            .currentCumulativePrice(pair, qti);
        require(lastTimestamp < blockTimestamp, "NOW");

        twap = (
            (basePriceCumulative - s_basePriceCumulative[ORACLE]) /
            (blockTimestamp - lastTimestamp)
        ) << 16;

        (uint rb, uint rq, ) = IUniswapV2Pair(pair).getReserves();
        if (qti == 0) {
            (rb, rq) = (rq, rb);
        }
        spot = FullMath.mulDiv(Q128, rq, rb);
    }

    // This function verifies the full block is old enough (MIN_BLOCK_COUNT),
    // not too old (or blockhash will return 0x0) and return the proof values
    // for the two storage slots we care about
    function submit(
        uint256 ORACLE,
        address uniswapV2Pair,
        ProofData memory proofData
    ) public virtual {
        (
            bytes32 storageRootHash,
            uint256 blockNumber,
            uint256 blockTimestamp
        ) = _getAccountStorageRoot(uniswapV2Pair, proofData);
        require(blockNumber > block.number - 256, "PROOF_TOO_OLD");

        uint32 window = uint32(ORACLE >> 192);
        require(blockTimestamp >= block.timestamp - window, "OLD_PROOF");
        require(blockTimestamp <= block.timestamp - (window >> 1), "NEW_PROOF");

        uint256 reserve0Reserve1TimestampPacked = Rlp.rlpBytesToUint256(
            MerklePatriciaVerifier.getValueFromProof(
                storageRootHash,
                RESERVE_TIMESTAMP_SLOT_HASH,
                proofData.reserveAndTimestampProofNodesRlp
            )
        );
        uint256 lastTimestamp = reserve0Reserve1TimestampPacked >> (112 + 112);
        require(s_lastTimestamp[ORACLE] < lastTimestamp, "EXIST");
        // TODO: require(lastTimestamp + window / 2 < block.timestamp, "PROOF_TOO_NEW");
        s_lastTimestamp[ORACLE] = lastTimestamp;

        uint256 qti = ORACLE >> 255;
        bytes32 slotHash = qti == 1 ? PRICE_CUMULATIVE_0_SLOT_HASH : PRICE_CUMULATIVE_1_SLOT_HASH;

        s_basePriceCumulative[ORACLE] = Rlp.rlpBytesToUint256(
            MerklePatriciaVerifier.getValueFromProof(
                storageRootHash,
                slotHash,
                proofData.priceAccumulatorProofNodesRlp
            )
        );
    }

    function _getAccountStorageRoot(
        address uniswapV2Pair,
        ProofData memory proofData
    )
        internal
        view
        returns (
            bytes32 storageRootHash,
            uint256 blockNumber,
            uint256 blockTimestamp
        )
    {
        bytes32 stateRoot;
        (stateRoot, blockTimestamp, blockNumber) = BlockVerifier
            .extractStateRootAndTimestamp(proofData.block);
        bytes memory accountDetailsBytes = MerklePatriciaVerifier
            .getValueFromProof(
                stateRoot,
                keccak256(abi.encodePacked(uniswapV2Pair)),
                proofData.accountProofNodesRlp
            );
        Rlp.Item[] memory accountDetails = Rlp.toList(
            Rlp.toItem(accountDetailsBytes)
        );
        return (Rlp.toBytes32(accountDetails[2]), blockNumber, blockTimestamp);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@keydonix/uniswap-oracle-contracts/source/BlockVerifier.sol";
import "solidity-rlp/contracts/RLPReader.sol";
import "./source/MerklePatriciaProofVerifier.sol";
import "./source/FullMath.sol";
import "./source/UniswapV2OracleLibrary.sol";
import "./interfaces/IFetcher.sol";

contract FetcherV2 is IFetcher {
    uint256 internal constant Q128 = 1 << 128;
	bytes32 internal constant RESERVE_TIMESTAMP_SLOT_HASH = keccak256(abi.encodePacked(uint256(8)));
	bytes32 internal constant PRICE_CUMULATIVE_0_SLOT_HASH = keccak256(abi.encodePacked(uint256(9)));
	bytes32 internal constant PRICE_CUMULATIVE_1_SLOT_HASH = keccak256(abi.encodePacked(uint256(10)));

    event Submit(
        bytes32 indexed ORACLE,
        uint proofBlock,
        uint dataTime,
        uint basePriceCumulative
    );

    struct Store {
        bool lock;
        uint64 proofBlock;
        uint128 dataTime;
    }

    mapping(uint256 => Store) s_store;
    mapping(uint256 => uint256) s_basePriceCumulative;

    struct ProofData {
        bytes block;
        bytes accountProofNodesRlp;
        bytes reserveAndTimestampProofNodesRlp;
        bytes priceAccumulatorProofNodesRlp;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant(uint ORACLE) {
        ensureStateIntegrity(ORACLE);
        s_store[ORACLE].lock = true;
        _;
        delete s_store[ORACLE].lock;
    }

    function fetch(
        uint256 ORACLE
    ) override external view returns (uint256 twap, uint256 spot) {
        uint32 window = uint32(ORACLE >> 192);
        uint proofBlock = s_store[ORACLE].proofBlock;
        require(proofBlock + window >= block.number, "OLD");
        require(proofBlock + (window >> 1) <= block.number, "NEW");
        address pair = address(uint160(ORACLE));
        uint256 qti = ORACLE >> 255;

        (uint basePriceCumulative, uint newDataTime) = UniswapV2OracleLibrary
            .currentCumulativePrice(pair, qti);
        uint dataTime = s_store[ORACLE].dataTime;
        require(dataTime < newDataTime, "NOW");

        twap = (
            (basePriceCumulative - s_basePriceCumulative[ORACLE]) /
            (newDataTime - dataTime)
        ) << 16;
        (uint rb, uint rq, ) = IUniswapV2Pair(pair).getReserves();
        if (qti == 0) {
            (rb, rq) = (rq, rb);
        }
        spot = FullMath.mulDiv(Q128, rq, rb);
    }

    function clear(uint256 ORACLE) external virtual {
        ensureStateIntegrity(ORACLE);
        delete s_store[ORACLE];
        delete s_basePriceCumulative[ORACLE];
    }

    // This function verifies the full block is old enough (MIN_BLOCK_COUNT),
    // not too old (or blockhash will return 0x0) and return the proof values
    // for the two storage slots we care about
    function submit(
        uint256 ORACLE,
        ProofData memory proofData
    ) public virtual nonReentrant(ORACLE) {
        (
            bytes32 storageRootHash,
            uint256 proofBlock
        ) = _getAccountStorageRoot(address(uint160(ORACLE)), proofData);

        {
            uint32 window = uint32(ORACLE >> 192);
            require(proofBlock >= block.number - window, "OLD_PROOF");
            require(proofBlock <= block.number - (window >> 1), "NEW_PROOF");
            s_store[ORACLE].proofBlock = uint64(proofBlock);
        }
    
        uint256 reserve0Reserve1TimestampPacked = RLPReader.toUint(RLPReader.toRlpItem(MerklePatriciaProofVerifier.extractProofValue(
            storageRootHash,
            _decodeBytes32Nibbles(RESERVE_TIMESTAMP_SLOT_HASH),
            RLPReader.toList(RLPReader.toRlpItem(proofData.reserveAndTimestampProofNodesRlp))
        )));
        uint256 newDataTime = reserve0Reserve1TimestampPacked >> (112 + 112);
        {
            uint256 dataTime = s_store[ORACLE].dataTime;
            require(dataTime <= newDataTime, "OLD_DATA");
            if (newDataTime == dataTime) {
                // no-change from the last proof, only the proofBlock need to be updated
                emit Submit(bytes32(ORACLE), proofBlock, 0, 0);
                return;
            }
            s_store[ORACLE].dataTime = uint128(newDataTime);
        }

        uint256 qti = ORACLE >> 255;
        bytes32 slotHash = qti == 1 ? PRICE_CUMULATIVE_0_SLOT_HASH : PRICE_CUMULATIVE_1_SLOT_HASH;

        uint basePriceCumulative = RLPReader.toUint(RLPReader.toRlpItem(
            MerklePatriciaProofVerifier.extractProofValue(
                storageRootHash,
                _decodeBytes32Nibbles(slotHash),
                RLPReader.toList(RLPReader.toRlpItem(proofData.priceAccumulatorProofNodesRlp))
            )
        ));
        s_basePriceCumulative[ORACLE] = basePriceCumulative;

        emit Submit(
            bytes32(ORACLE),
            proofBlock,
            newDataTime,
            basePriceCumulative
        );
    }

    /**
     * @dev against read-only reentrancy
     */
    function ensureStateIntegrity(uint ORACLE) public view {
        require(!s_store[ORACLE].lock, 'FetcherV2: STATE_INTEGRITY');
    }

    function _decodeBytes32Nibbles(bytes32 path) internal pure returns (bytes memory nibblePath) {
		// our input is a 32-byte path, but we have to prepend a single 0 byte to that and pass it along as a 33 byte memory array since that is what getNibbleArray wants
		nibblePath = new bytes(33);
		assembly { mstore(add(nibblePath, 33), path) }
		nibblePath = _getNibbleArray(nibblePath);
    }

	// bytes byteArray must be hp encoded
	function _getNibbleArray(bytes memory byteArray) private pure returns (bytes memory) {
		bytes memory nibbleArray;
		if (byteArray.length == 0) return nibbleArray;

		uint8 offset;
		uint8 hpNibble = uint8(_getNthNibbleOfBytes(0,byteArray));
		if(hpNibble == 1 || hpNibble == 3) {
			nibbleArray = new bytes(byteArray.length*2-1);
			byte oddNibble = _getNthNibbleOfBytes(1,byteArray);
			nibbleArray[0] = oddNibble;
			offset = 1;
		} else {
			nibbleArray = new bytes(byteArray.length*2-2);
			offset = 0;
		}

		for(uint i=offset; i<nibbleArray.length; i++) {
			nibbleArray[i] = _getNthNibbleOfBytes(i-offset+2,byteArray);
		}
		return nibbleArray;
	}

	function _getNthNibbleOfBytes(uint n, bytes memory str) private pure returns (byte) {
		return byte(n%2==0 ? uint8(str[n/2])/0x10 : uint8(str[n/2])%0x10);
	}

    function _getAccountStorageRoot(
        address uniswapV2Pair,
        ProofData memory proofData
    )
        internal
        view
        returns (
            bytes32 storageRootHash,
            uint256 blockNumber
        )
    {
        bytes32 stateRoot;
        (stateRoot, , blockNumber) = BlockVerifier
            .extractStateRootAndTimestamp(proofData.block);
        require(blockhash(blockNumber) != 0, "blockhash = 0");

        bytes memory accountDetailsBytes = MerklePatriciaProofVerifier
            .extractProofValue(
                stateRoot,
                _decodeBytes32Nibbles(keccak256(abi.encodePacked(uniswapV2Pair))),
                RLPReader.toList(RLPReader.toRlpItem(proofData.accountProofNodesRlp))
            );
        RLPReader.RLPItem[] memory accountDetails = RLPReader.toList(
            RLPReader.toRlpItem(accountDetailsBytes)
        );
        return (bytes32(RLPReader.toUint(accountDetails[2])), blockNumber);
    }
}

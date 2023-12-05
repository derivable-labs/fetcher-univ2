// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/introspection/ERC165.sol";
import "./source/BlockVerifier.sol";
import "solidity-rlp/contracts/RLPReader.sol";
import "./source/MerklePatriciaProofVerifier.sol";
import "./source/FullMath.sol";
import "./source/UniswapV2OracleLibrary.sol";
import "./interfaces/IFetcher.sol";
import "./source/Oracle.sol";

contract FetcherV2 is IFetcher, ERC165 {

    using Oracle for Oracle.Slot[65535];

    uint16 internal immutable observationCardinality;
    uint64 internal immutable interval;

    uint256 internal constant Q128 = 1 << 128;
	bytes32 internal constant RESERVE_TIMESTAMP_SLOT_HASH = keccak256(abi.encodePacked(uint256(8)));
	bytes32 internal constant PRICE_CUMULATIVE_0_SLOT_HASH = keccak256(abi.encodePacked(uint256(9)));
	bytes32 internal constant PRICE_CUMULATIVE_1_SLOT_HASH = keccak256(abi.encodePacked(uint256(10)));

    struct ProofData {
        bytes block;
        bytes accountProofNodesRlp;
        bytes reserveAndTimestampProofNodesRlp;
        bytes priceAccumulatorProofNodesRlp;
    }

    mapping(uint256 => Oracle.Slot[65535]) public s_store;
    mapping(uint256 => uint16) public s_observation_index;

    event Submit(
        bytes32 indexed ORACLE,
        uint proofBlock,
        uint dataTime,
        uint basePriceCumulative
    );

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant(uint ORACLE) {
        ensureStateIntegrity(ORACLE);
        s_store[ORACLE][s_observation_index[ORACLE]].lock = true;
        _;
        delete s_store[ORACLE][s_observation_index[ORACLE]].lock;
    }
    
    constructor(uint16 _observationCardinality, uint64 _interval) public {
        observationCardinality = _observationCardinality;
        interval = _interval;
    }

    function fetch(
        uint256 ORACLE
    ) override external returns (uint256 twap, uint256 spot) {
        uint32 window = uint32(ORACLE >> 192);
        uint32 window_max = uint32(ORACLE >> 160);
        if (window_max > 0) {
            require(window < window_max, "WRONG_WINDOW_CONFIG");
        }

        // find the observation index has the biggest proofBlock that is smaller than (block.number - window)
        uint16 foundIndex = s_store[ORACLE].find(window, observationCardinality);

        address pair = address(uint160(ORACLE));
        uint256 qti = ORACLE >> 255;
        (uint basePriceCumulative, uint newDataTime) = UniswapV2OracleLibrary
            .currentCumulativePrice(pair, qti);

        if (s_store[ORACLE][s_observation_index[ORACLE]].proofBlock + interval < block.number) {
            // write slot0 to observations
            writeToObservations(ORACLE, basePriceCumulative, uint64(block.number), newDataTime);
        }

        uint dataTime = s_store[ORACLE][foundIndex].dataTime;
        require(dataTime < newDataTime, "NOW");

        twap = (
            (basePriceCumulative - s_store[ORACLE][foundIndex].basePriceCumulative) /
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
        for (uint16 i = 0; i < s_observation_index[ORACLE] + 1; i++) {
            delete s_store[ORACLE][i];
        }
        delete s_observation_index[ORACLE];
    }

    function writeToObservations(uint256 ORACLE, uint256 basePriceCumulative, uint256 proofBlock, uint256 dataTime) internal virtual{
        uint16 indexUpdated = s_store[ORACLE].write(
            s_observation_index[ORACLE],
            basePriceCumulative,
            uint64(proofBlock),
            uint128(dataTime),
            observationCardinality
        );
        s_observation_index[ORACLE] = indexUpdated;
    }

    // This function verifies the full block is old enough (MIN_BLOCK_COUNT),
    // not too old (or blockhash will return 0x0) and return the proof values
    // for the two storage slots we care about
    function submit(
        uint256 ORACLE,
        ProofData calldata proofData
    ) external virtual nonReentrant(ORACLE) {
        uint256 startGas = gasleft();
        (
            bytes32 storageRootHash,
            uint256 proofBlock
        ) = _getAccountStorageRoot(address(uint160(ORACLE)), proofData);
        {
            uint32 window = uint32(ORACLE >> 192);
            uint32 window_max = uint32(ORACLE >> 160);
            require(block.number - window >= proofBlock, "NEW_PROOF");
            if (window_max == 0) {
                require(proofBlock > s_store[ORACLE][s_observation_index[ORACLE]].proofBlock, "OLD_PROOF");
            } else {
                require(window < window_max, "WRONG_WINDOW_CONFIG");
                require(proofBlock > s_store[ORACLE][s_observation_index[ORACLE]].proofBlock && proofBlock >= block.number - window_max, "OLD_PROOF");
            }
        }
    
        uint256 reserve0Reserve1TimestampPacked = RLPReader.toUint(RLPReader.toRlpItem(MerklePatriciaProofVerifier.extractProofValue(
            storageRootHash,
            _decodeBytes32Nibbles(RESERVE_TIMESTAMP_SLOT_HASH),
            RLPReader.toList(RLPReader.toRlpItem(proofData.reserveAndTimestampProofNodesRlp))
        )));
        uint256 newDataTime = reserve0Reserve1TimestampPacked >> (112 + 112);

        bytes32 slotHash = ORACLE >> 255 == 1 ? PRICE_CUMULATIVE_0_SLOT_HASH : PRICE_CUMULATIVE_1_SLOT_HASH;
        uint basePriceCumulative = RLPReader.toUint(RLPReader.toRlpItem(
            MerklePatriciaProofVerifier.extractProofValue(
                storageRootHash,
                _decodeBytes32Nibbles(slotHash),
                RLPReader.toList(RLPReader.toRlpItem(proofData.priceAccumulatorProofNodesRlp))
            )
        ));

        // write slot0 to observations
        writeToObservations(ORACLE, basePriceCumulative, proofBlock, newDataTime);
        emit Submit(
            bytes32(ORACLE),
            proofBlock,
            newDataTime,
            basePriceCumulative
        );
        // Calculate the gas used for the entire transaction
        uint256 gasUsed = startGas - gasleft();
        // Check if the contract has enough balance or not for return the submitter 7/8 of the gas fee
        if (address(this).balance >= gasUsed * tx.gasprice) {
            // Transfer the gas fee to the submitter
            msg.sender.transfer(gasUsed * tx.gasprice * 7 / 8);
        }
    }

    /**
     * @dev against read-only reentrancy
     */
    function ensureStateIntegrity(uint ORACLE) public view {
        require(!s_store[ORACLE][s_observation_index[ORACLE]].lock, 'FetcherV2: STATE_INTEGRITY');
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
        ProofData calldata proofData
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

    // IERC165-supportsInterface
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == 0x61206120 ||
            super.supportsInterface(interfaceId);
    }

    // accepting ETH
    receive() external payable {}
}

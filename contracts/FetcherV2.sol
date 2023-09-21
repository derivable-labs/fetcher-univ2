// SPDX-License-Identifier: MIT
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import {UniswapOracle} from "./source/UniswapOracle.sol";
import {IUniswapV2Pair} from "./source/IUniswapV2Pair.sol";
import "./source/FullMath.sol";

contract FetcherV2 is UniswapOracle {
    uint256 internal constant Q64 = 1 << 64;
    uint256 internal constant Q80 = 1 << 80;
    uint256 internal constant Q192 = 1 << 192;
    uint256 internal constant Q255 = 1 << 255;
    uint256 internal constant Q128 = 1 << 128;
    uint256 internal constant Q256M = type(uint256).max;

    // ORACLE -> timestamp
    mapping(uint256 => uint256) lastTimeUpdated;

    // ORACLE -> price
    mapping(uint256 => uint256) lastTWAPPrice;

    event Price(uint256 oracle, uint256 price);

    function fetch(
        uint256 ORACLE
    ) public view returns (uint256 twap, uint256 spot) {
        address pair = address(uint160(ORACLE));
        uint256 qti = ORACLE >> 255;
        uint32 window = uint32(ORACLE >> 192);
        require(
            block.timestamp - lastTimeUpdated[ORACLE] < uint256(window),
            "OLD"
        );

        spot = _getSpot(pair, qti);
        twap = lastTWAPPrice[ORACLE];
    }

    function fetchTwapPrice(
        uint256 ORACLE,
        UniswapOracle.ProofData memory proofData
    ) public returns (uint256 price, uint256 blockNumber) {
        IUniswapV2Pair pair = IUniswapV2Pair(address(uint160(ORACLE)));
        uint256 qti = ORACLE >> 255;
        address denominationToken = (qti == 1) ? pair.token1() : pair.token0();

        uint8 minBlocksBack = 0;
        uint8 maxBlocksBack = 255;

        (price, blockNumber) = getPrice(
            pair,
            denominationToken,
            minBlocksBack,
            maxBlocksBack,
            proofData
        );

        lastTimeUpdated[ORACLE] = block.timestamp;
        lastTWAPPrice[ORACLE] = price;

        emit Price(ORACLE, price);
    }

    function _getSpot(
        address pair,
        uint256 qti
    ) internal view returns (uint256 spot) {
        (uint r0, uint r1, ) = IUniswapV2Pair(pair).getReserves();
        (uint rb, uint rq) = (qti == 1) ? (r0, r1) : (r1, r0);
        spot = FullMath.mulDiv(rq, Q128, rb);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import {UniswapV2OracleLibrary} from "@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol";
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

    // INDEX -> timestamp
    mapping(uint256 => uint256) lastTimeUpdated;

    // INDEX -> price
    mapping(uint256 => uint256) lastTWAPPrice;

    // INDEX -> last cumulative price
    mapping(uint256 => uint256) lastCumulativePrice;

    // event Price(uint256 oracle, uint256 price);

    function init(uint256 INDEX) public {
        address pair = address(uint160(INDEX));
        uint256 qti = INDEX >> 255;

        require(lastTimeUpdated[INDEX] == 0, "initialized");
        (
            uint256 basePriceCumulative,
            uint256 quotePriceCumulative,
            uint32 blockTimestamp
        ) = UniswapV2OracleLibrary.currentCumulativePrices(pair);
        if (qti == 0) {
            basePriceCumulative = quotePriceCumulative;
        }
        lastTimeUpdated[INDEX] = blockTimestamp;
        lastCumulativePrice[INDEX] = basePriceCumulative;
    }

    function fetch(uint256 ORACLE) public returns (uint256 twap, uint256 spot) {
        address pair = address(uint160(ORACLE));
        uint256 qti = ORACLE >> 255;
        uint32 window = uint32(ORACLE >> 192);
        uint INDEX = _getIndex(pair, qti);
        require(lastTimeUpdated[INDEX] > 0, "uninitialized");
        require(
            block.timestamp - lastTimeUpdated[_getIndex(pair, qti)] <
                uint256(window),
            "OLD"
        );

        spot = _getSpot(pair, qti);
        twap = _getTwapAndUpdate(pair, qti);
    }

    function submit(
        uint256 INDEX,
        UniswapOracle.ProofData memory proofData
    )
        public
        returns (
            uint256 historicPriceCumulativeLast,
            uint256 historicBlockTimestamp
        )
    {
        IUniswapV2Pair pair = IUniswapV2Pair(address(uint160(INDEX)));
        uint256 qti = INDEX >> 255;
        address denominationToken = (qti == 1) ? pair.token1() : pair.token0();

        uint8 minBlocksBack = 0;
        uint8 maxBlocksBack = 255;

        (
            historicPriceCumulativeLast,
            historicBlockTimestamp
        ) = getHistoricPriceCumulativeLast(
            pair,
            qti == 0,
            minBlocksBack,
            maxBlocksBack,
            proofData
        );

        if (historicBlockTimestamp > lastTimeUpdated[INDEX]) {
            lastTWAPPrice[INDEX] =
                (historicPriceCumulativeLast -
                    lastCumulativePrice[INDEX] /
                    (historicBlockTimestamp - lastTimeUpdated[INDEX])) >>
                16;
            lastTimeUpdated[INDEX] = historicBlockTimestamp;
            lastCumulativePrice[INDEX] = historicPriceCumulativeLast;
        }
    }

    function _getTwapAndUpdate(
        address pair,
        uint256 qti
    ) internal returns (uint256 twap) {
        uint256 INDEX = _getIndex(pair, qti);

        if (lastTimeUpdated[INDEX] < block.timestamp) {
            (
                uint256 basePriceCumulative,
                uint256 quotePriceCumulative,
                uint32 blockTimestamp
            ) = UniswapV2OracleLibrary.currentCumulativePrices(pair);
            if (qti == 0) {
                basePriceCumulative = quotePriceCumulative;
            }
            if (blockTimestamp == lastTimeUpdated[INDEX]) {
                twap = lastTWAPPrice[INDEX];
            } else {
                twap =
                    ((basePriceCumulative - lastCumulativePrice[INDEX]) /
                        (blockTimestamp - lastTimeUpdated[INDEX])) >>
                    16;
                lastTWAPPrice[INDEX] = twap;
                lastTimeUpdated[INDEX] = blockTimestamp;
                lastCumulativePrice[INDEX] = basePriceCumulative;
            }
        } else {
            twap = lastTWAPPrice[INDEX];
        }
    }

    function _getSpot(
        address pair,
        uint256 qti
    ) internal view returns (uint256 spot) {
        (uint r0, uint r1, ) = IUniswapV2Pair(pair).getReserves();
        (uint rb, uint rq) = (qti == 1) ? (r0, r1) : (r1, r0);
        spot = FullMath.mulDiv(rq, Q128, rb);
    }

    function _getIndex(
        address pair,
        uint256 qti
    ) internal pure returns (uint256 index) {
        return (qti << 255) + uint256(pair);
    }
}

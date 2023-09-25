pragma solidity >=0.5.0;

import "@keydonix/uniswap-oracle-contracts/source/IUniswapV2Pair.sol";
import "./FullMath.sol";

// library with helper methods for oracles that are concerned with computing average prices
library UniswapV2OracleLibrary {
    uint256 internal constant Q112 = 0x10000000000000000000000000000; // 2**112

    // helper function that returns the current block timestamp within the range of uint32, i.e. [0, 2**32 - 1]
    function currentBlockTimestamp() internal view returns (uint32) {
        return uint32(block.timestamp % 2 ** 32);
    }

    // produces the cumulative price using counterfactuals to save gas and avoid a call to sync.
    function currentCumulativePrice(
        address pair,
        uint qti
    ) internal view returns (uint priceCumulative, uint32 blockTimestamp) {
        blockTimestamp = currentBlockTimestamp();
        priceCumulative = qti == 1 ?
            IUniswapV2Pair(pair).price0CumulativeLast():
            IUniswapV2Pair(pair).price1CumulativeLast();

        // if time has elapsed since the last update on the pair, mock the accumulated price values
        (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) = IUniswapV2Pair(pair).getReserves();
        if (blockTimestampLast != blockTimestamp) {
            // subtraction overflow is desired
            uint32 timeElapsed = blockTimestamp - blockTimestampLast;
            uint256 price = qti == 1 ?
                FullMath.mulDiv(Q112, reserve1, reserve0):
                FullMath.mulDiv(Q112, reserve0, reserve1);
            // addition overflow is desired
            // counterfactual
            priceCumulative += price * timeElapsed;
        }
    }
}

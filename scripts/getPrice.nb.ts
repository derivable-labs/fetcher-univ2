import { Crypto } from '@peculiar/webcrypto'
;(global as any).crypto = new Crypto()
import hre, { ethers } from "hardhat"
import * as OracleSdkAdapter from './OracleSdkAdapterNB'
import addresses from '../addresses.json'
import { getAccumulatorPrice, getPrice } from './OracleSdkNB';

const bn = ethers.BigNumber.from

const Q128 = bn(1).shl(128)

const main = async (hre: any) => {
    const url = hre.network.config.url
    const provider = new ethers.providers.JsonRpcProvider(url)
    const blockNumber = await provider.getBlockNumber()
    const getStorageAt = OracleSdkAdapter.getStorageAtFactory(provider)
    const getBlockByNumber = OracleSdkAdapter.getBlockByNumberFactory(provider)
    // window time (blocks)
    const windowTime = 100
    const quoteTokenIndex = addresses.weth.toLowerCase() < addresses.busd.toLowerCase() ? 1 : 0
    // estimate the moving average price off-chain for presentation in your UI
    const twap = await getPrice(getStorageAt,  getBlockByNumber, addresses.uniswapPool, addresses.busd, blockNumber - (windowTime / 2))
    const uniswapPair = new ethers.Contract(addresses.uniswapPool, require("@uniswap/v2-core/build/UniswapV2Pair.json").abi, provider)
    // get spot price
    let spot
    const [r0, r1] = await uniswapPair.getReserves()
    if (quoteTokenIndex == 0) {
        spot = r0.mul(Q128).div(r1)
    } else {
        spot = r1.mul(Q128).div(r0)
    }
    const price = {
        twap: bn(0),
        spot: bn(0)
    }
    price.twap = twap.mul(bn(2).pow(16))
    price.spot = spot
    console.log(price)

    const accumulatorPrice = await getAccumulatorPrice(getStorageAt,  getBlockByNumber, addresses.uniswapPool, addresses.busd, blockNumber - (windowTime / 2))
    console.log(accumulatorPrice)
}

main(hre).catch((error) => {
    console.error(error)
    process.exitCode = 1
})
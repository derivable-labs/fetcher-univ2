import { Crypto } from '@peculiar/webcrypto'
;(global as any).crypto = new Crypto()
import hre, { ethers } from "hardhat"
import * as OracleSdkAdapter from './OracleSdkAdapter'
import addresses from '../addresses.json'
import { getPrice } from './OracleSdk';

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
    const twap = await getPrice(getStorageAt,  getBlockByNumber, BigInt(addresses.uniswapPool), BigInt(addresses.busd), bn(blockNumber).sub(windowTime / 2).toBigInt())
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
    price.twap = bn(twap * 2n**16n)
    price.spot = spot
    console.log(price)
}

main(hre).catch((error) => {
    console.error(error)
    process.exitCode = 1
})
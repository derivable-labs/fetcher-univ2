import { Crypto } from '@peculiar/webcrypto'
(global as any).crypto = new Crypto()
import hre, { ethers } from 'hardhat'
import * as OracleSdk from './OracleSdk'
import * as OracleSdkAdapter from './OracleSdkAdapter'
import { JsonRpcProvider } from '@ethersproject/providers'
import FetcherV2Mock from '../artifacts/contracts/support/FetcherV2Mock.sol/FetcherV2Mock.json'
import FetcherV2 from '../artifacts/contracts/FetcherV2.sol/FetcherV2.json'
import UTROverride from './abi/UTROverride.json'

const opts = {
    gasLimit: 500000
}

const wbnb = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
const uniswapPool = '0x49B355Bb422dC456314D160C353416afBcAF2996'
const fetcherV2Addr = '0x737ae4d8bDaAdeCDbACdF7201a46bbCfa2aB104e' as string
const utrAddr = '0x05D78D11f1B05ada41daD65B6711f05bC1C1645b' as string

const bn = ethers.BigNumber.from

const main = async (hre: any) => {
    const url = hre.network.config.url
    // Connect to the network
    const provider = new JsonRpcProvider(url)
    const getStorageAt = OracleSdkAdapter.getStorageAtFactory(provider)
    const blockNumber = await provider.getBlockNumber()
    console.log(blockNumber)
    const getBlockByNumber = OracleSdkAdapter.getBlockByNumberFactory(provider)
    const windowTime = 100
    // @ts-ignore
    provider.setStateOverride({
        [fetcherV2Addr]: {
            code: FetcherV2Mock.deployedBytecode,
        },
        [utrAddr]: {
            code: UTROverride.deployedBytecode,
        }
    })
    
    const fetcherV2MockContract = new ethers.Contract(fetcherV2Addr, FetcherV2Mock.abi, provider)
    const fetcherV2Contract = new ethers.Contract(fetcherV2Addr, FetcherV2.abi, provider)

    const quoteTokenIndex = wbnb.toLowerCase() < '0x9A663044484304f9D357877A9DD36C7951363333'.toLowerCase() ? 1 : 0
    const index = ethers.utils.hexZeroPad(
        bn(quoteTokenIndex).shl(255).add(bn(windowTime).shl(256 - 64)).add(uniswapPool).toHexString(),
        32,
    )

    const utr = new ethers.Contract(utrAddr, UTROverride.abi, provider)
    
    const targetBlock = bn(blockNumber).sub(windowTime / 2)
    const accumulatorPrice = await OracleSdk.getAccumulatorPrice(getStorageAt, getBlockByNumber, BigInt(uniswapPool), BigInt(wbnb), targetBlock.toBigInt())
    try {
        const tx = await utr.callStatic.exec([], [
            {
                inputs: [],
                code: fetcherV2Addr,
                data: (await fetcherV2MockContract.populateTransaction.submitPrice(
                    index,
                    bn(accumulatorPrice),
                    targetBlock.toBigInt(),
                    (await provider.getBlock(targetBlock.toNumber())).timestamp
                )).data,
            },
            {
                inputs: [],
                code: fetcherV2Addr,
                data: (await fetcherV2Contract.populateTransaction.fetch(
                    index,
                )).data,
            },
        ], opts)
        console.log(tx)
    } catch (error) {
        console.log(error)
    }
}

main(hre).catch((error) => {
    console.error(error)
    process.exitCode = 1
})
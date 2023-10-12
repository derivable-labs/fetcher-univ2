import { Crypto } from '@peculiar/webcrypto'
(global as any).crypto = new Crypto()
import hre, { ethers } from "hardhat"
import addresses from '../addresses.json'
import * as OracleSdk from './OracleSdk'
import * as OracleSdkAdapter from './OracleSdkAdapter'
import { JsonRpcProvider } from '@ethersproject/providers'

const opts = {
    gasLimit: 500000
}

const bn = ethers.BigNumber.from

const main = async (hre: any) => {
    const url = hre.network.config.url
    // Connect to the network
    const provider = new JsonRpcProvider(url)
    const getStorageAt = OracleSdkAdapter.getStorageAtFactory(provider)
    const blockNumber = await provider.getBlockNumber()
    console.log(blockNumber)

    const getProof = OracleSdkAdapter.getProofFactory(provider)
    const getBlockByNumber = OracleSdkAdapter.getBlockByNumberFactory(provider)

    const proof = await OracleSdk.getProof(getStorageAt, getProof, getBlockByNumber, BigInt(addresses.uniswapPool), BigInt(addresses.busd), bn(blockNumber).sub(50).toBigInt())
    console.log(proof)

    const account = hre.network.config.accounts[0]
    const wallet = new ethers.Wallet(account, provider)

    // const priceEmitterABI = require("../artifacts/contracts/PriceEmitter.sol/PriceEmitter.json").abi
    // const priceEmitter = new ethers.Contract(addresses.priceEmitter, priceEmitterABI, provider)
    // const contractWithSigner = priceEmitter.connect(wallet)
    // const receipt = await (await contractWithSigner.emitPrice(addresses.uniswapPool, addresses.busd, 0n, 1n, proof, opts)).wait()
	// console.log(receipt.events[0])

    const fetcherABI = require("../artifacts/contracts/FetcherV2.sol/FetcherV2.json").abi
    const fetcher = new ethers.Contract(addresses.fetcherV2, fetcherABI, provider)
    const contractWithSigner = fetcher.connect(wallet)

    const quoteTokenIndex = addresses.weth.toLowerCase() < addresses.busd.toLowerCase() ? 1 : 0
    const index = ethers.utils.hexZeroPad(
        bn(quoteTokenIndex).shl(255).add(bn(100).shl(256 - 64)).add(addresses.uniswapPool).toHexString(),
        32,
    )

    const receipt = await (await contractWithSigner.submit(index, proof, opts)).wait()
    console.log(receipt)
}

main(hre).catch((error) => {
    console.error(error)
    process.exitCode = 1
})
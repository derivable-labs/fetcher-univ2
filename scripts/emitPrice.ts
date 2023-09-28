import { Crypto } from '@peculiar/webcrypto'
;(global as any).crypto = new Crypto()
import * as OracleSdk from '@keydonix/uniswap-oracle-sdk'
import hre, { ethers } from "hardhat"
import { ethGetBlockByNumber } from './adapters';
import { createMemoryRpc } from './rpc-factories'
import addresses from '../addresses.json'
import { getProof } from './helper';

const opts = {
    gasLimit: 500000
}

const bn = ethers.BigNumber.from

const main = async (hre: any) => {
    const url = hre.network.config.url
    const gasPrice = 10n**9n
    const rpc = await createMemoryRpc(url, gasPrice)
    const blockNumber = await rpc.getBlockNumber()
    // get the proof from the SDK
	// const proofSdk = await OracleSdk.getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), BigInt(addresses.uniswapPool), BigInt(addresses.busd), bn(blockNumber).sub(0).toBigInt())
    // console.log(proofSdk)
    // Connect to the network
    const provider = new ethers.providers.JsonRpcProvider(url)
    const account = hre.network.config.accounts[0]
    const wallet = new ethers.Wallet(account, provider)

    const proof = await getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), BigInt(addresses.uniswapPool), BigInt(addresses.busd), bn(blockNumber).sub(0).toBigInt())
    console.log(proof)

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
        bn(quoteTokenIndex).shl(255).add(bn(300).shl(256 - 64)).add(addresses.uniswapPool).toHexString(),
        32,
    )

    const receipt = await (await contractWithSigner.submit(index, proof, opts)).wait()
    console.log(receipt.events[0])

    // create the getters the SDK needs from an Ethereum instance off the window.  you could use `window.web3.currentProvider` instead of `window.ethereum` if that is what is available
    // const provider = new Web3.providers.HttpProvider(
    //     hre.network.config.url,
    // );
    // const web3 = new Web3(provider)
    // const getStorageAt = OracleSdkAdapter.getStorageAtFactory(provider)

    // const getProof = OracleSdkAdapter.getProofFactory(provider)
    // const getBlockByNumber = OracleSdkAdapter.getBlockByNumberFactory(provider)

    // estimate the moving average price off-chain for presentation in your UI
    // const estimatedPrice = await OracleSdk.getPrice(rpc.getStorageAt,  ethGetBlockByNumber.bind(undefined, rpc), BigInt('0xFB5aF9BD42D3Be82C8f431Cdc1c9d12BeaB9D636'), BigInt('0x729b8CEEA6631F563e9358F1aC2e5CaFD3eF2338'), blockNumber)
    // console.log(estimatedPrice)
    // // get the proof from the SDK
    // const proof = await OracleSdk.getProof(getStorageAt, getProof, getBlockByNumber, uniswapExchangeAddress, denominationTokenAddress, blockNumber)

    // // inside this contract call we'll have trustless access to a Uniswap average price between `blockNumber` and `currentBlockNumber`
    // await priceEmitter.emitPrice(uniswapExchangeAddress, denominationTokenAddress, minBlocksBackAllowed, maxBlocksBackAllowed, proof)
}

main(hre).catch((error) => {
    console.error(error)
    process.exitCode = 1
})
import { Crypto } from '@peculiar/webcrypto'
;(global as any).crypto = new Crypto()
import * as OracleSdk from '@keydonix/uniswap-oracle-sdk'
import * as OracleSdkAdapter from '@keydonix/uniswap-oracle-sdk-adapter'
import hre, { ethers } from "hardhat"
import { ethGetBlockByNumber } from './adapters';
import { createMemoryRpc } from './rpc-factories'
import Web3 from 'web3'

const opts = {
    gasLimit: 500000
}

const main = async (hre: any) => {
    const url = hre.network.config.url
    const gasPrice = 10n**9n
    const rpc = await createMemoryRpc(url, gasPrice)
    const blockNumber = await rpc.getBlockNumber()
    // get the proof from the SDK
	const proof = await OracleSdk.getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), BigInt('0xFB5aF9BD42D3Be82C8f431Cdc1c9d12BeaB9D636'), BigInt('0x729b8CEEA6631F563e9358F1aC2e5CaFD3eF2338'), blockNumber)
    // console.log(proof)
    // Connect to the network
    const provider = new ethers.providers.JsonRpcProvider(url)
    const account = hre.network.config.accounts[0]
    const wallet = new ethers.Wallet(account, provider)

    const priceEmitterABI = require("../artifacts/contracts/PriceEmitter.sol/PriceEmitter.json").abi
    const priceEmitter = new ethers.Contract('0xbe11b33F89d7dED6eE7B3Ab9966CFCe3d5237677', priceEmitterABI, provider)
    const contractWithSigner = priceEmitter.connect(wallet)
    const events = await contractWithSigner.emitPrice('0xFB5aF9BD42D3Be82C8f431Cdc1c9d12BeaB9D636', '0x729b8CEEA6631F563e9358F1aC2e5CaFD3eF2338', 0n, 1n, proof, opts)
	console.log(events)
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
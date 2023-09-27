import { Crypto } from '@peculiar/webcrypto'
;(global as any).crypto = new Crypto()
import * as OracleSdk from '@keydonix/uniswap-oracle-sdk'
import * as OracleSdkAdapter from '@keydonix/uniswap-oracle-sdk-adapter'
import hre, { ethers } from "hardhat"
import { createMemoryRpc } from '../scripts/rpc-factories';
import { ethGetBlockByNumber } from '../scripts/adapters';

const pe = (x: any) => ethers.utils.parseEther(String(x))
const bn = ethers.BigNumber.from

describe('price', function () {
    let uniswapPool: any
    let fetcherV2: any
    let busd: any
    let weth: any

    beforeEach(async function() {
        // deploy uniswap v2
        const [owner] = await ethers.getSigners()
        const signer = owner
        // weth test
        const compiledWETH = require("canonical-weth/build/contracts/WETH9.json")
        const WETH = await new ethers.ContractFactory(compiledWETH.abi, compiledWETH.bytecode, signer)
        // uniswap factory
        const compiledUniswapFactory = require("@uniswap/v2-core/build/UniswapV2Factory.json")
        const UniswapFactory = await new ethers.ContractFactory(compiledUniswapFactory.interface, compiledUniswapFactory.bytecode, signer)
        // uniswap router
        const compiledUniswapRouter = require("@uniswap/v2-periphery/build/UniswapV2Router02")
        const UniswapRouter = await new ethers.ContractFactory(compiledUniswapRouter.abi, compiledUniswapRouter.bytecode, signer)
        // erc20 factory
        const compiledERC20 = require("@uniswap/v2-core/build/ERC20.json")
        const erc20Factory = new ethers.ContractFactory(compiledERC20.abi, compiledERC20.bytecode, signer)
        // setup uniswap
        busd = await erc20Factory.deploy(pe(10000000000))
        console.log('busd: ', busd.address)
        weth = await WETH.deploy()
        console.log('weth: ', weth.address)
        const uniswapFactory = await UniswapFactory.deploy(busd.address)
        console.log('uniswapFactory: ', uniswapFactory.address)
        const uniswapRouter = await UniswapRouter.deploy(uniswapFactory.address, weth.address)
        console.log('uniswapRouter: ', uniswapRouter.address)
        await busd.approve(uniswapRouter.address, ethers.constants.MaxUint256)
        await uniswapRouter.addLiquidityETH(
            busd.address,
            '10480444925500000000000000',
            '10480444925000000000000000',
            '6986963283651477901852',
            owner.address,
            new Date().getTime() + 100000,
            {
                value: '6986963283651477901852'
            }
        )
        const pairAddresses = await uniswapFactory.allPairs(0)
        uniswapPool = new ethers.Contract(pairAddresses, require("@uniswap/v2-core/build/UniswapV2Pair.json").abi, signer)
        console.log('uniswapPool: ', uniswapPool.address)
        // deploy PriceEmitter
        const PriceEmitter = await ethers.getContractFactory("PriceEmitter")
        const priceEmitter = await PriceEmitter.deploy()
        await priceEmitter.deployed()
        console.log('priceEmitter: ', priceEmitter.address)
        // deploy FetcherV2
        const FetcherV2 = await ethers.getContractFactory("FetcherV2")
        fetcherV2 = await FetcherV2.deploy()
        await fetcherV2.deployed()
        console.log('fetcherV2: ', fetcherV2.address)

        // swap monkey
        for (let index = 0; index < 100; index++) {
            await uniswapRouter
                .connect(signer)
                .swapExactTokensForETH(
                    pe(Math.floor(Math.random() * 11) + 1),
                    0,
                    [busd.address, weth.address],
                    owner.address,
                    100000000000000,
                    {gasLimit: 5000000}
                );
            await ethers.provider.send("evm_increaseTime", [3])
            await ethers.provider.send("evm_mine", [])
            await uniswapRouter
                .connect(signer)
                .swapExactETHForTokens(
                    0,
                    [weth.address, busd.address],
                    owner.address,
                    100000000000000,
                    {
                        value: pe(Math.floor(Math.random() * 11) + 1),
                        gasLimit: 5000000
                    }
                )
            await ethers.provider.send("evm_increaseTime", [3])
            await ethers.provider.send("evm_mine", [])
        }
    })
    it('fetch price', async () => {
        const url = 'http://127.0.0.1:8545';
        const gasPrice = 10n ** 9n;
        const rpc = await createMemoryRpc(url, gasPrice);
        const blockNumber = await rpc.getBlockNumber();
        // get the proof from the SDK
        const proof = await OracleSdk.getProof(
            rpc.getStorageAt,
            rpc.getProof,
            ethGetBlockByNumber.bind(undefined, rpc),
            BigInt(uniswapPool.address),
            BigInt(busd.address),
            bn(blockNumber).sub(100).toBigInt()
        );
        // Connect to the network
        const contractWithSigner = fetcherV2;
        const quoteTokenIndex =
            weth.address.toLowerCase() < busd.address.toLowerCase() ? 1 : 0;
        const index = ethers.utils.hexZeroPad(
            bn(quoteTokenIndex)
                .shl(255)
                .add(bn(300).shl(256 - 64))
                .add(uniswapPool.address)
                .toHexString(),
            32
        );

        const receipt = await (
            await contractWithSigner.submit(index, proof, {gasLimit: 5000000})
        ).wait();
        console.log(receipt);
    })
})
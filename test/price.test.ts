import * as OracleSdk from '@keydonix/uniswap-oracle-sdk'
import * as OracleSdkAdapter from '@keydonix/uniswap-oracle-sdk-adapter'
import hre, { ethers } from "hardhat"

const pe = (x: any) => ethers.utils.parseEther(String(x))

describe('price', function () {
    before(async function() {
        console.log(hre.network.name)
        // deploy uniswap v2
        const [owner] = await ethers.getSigners()
        console.log( await owner.getBalance())
        const signer = owner
        // weth test
        const compiledWETH = require("canonical-weth/build/contracts/WETH9.json")
        const WETH = new ethers.ContractFactory(compiledWETH.abi, compiledWETH.bytecode, signer)
        // uniswap factory
        const compiledUniswapFactory = require("@uniswap/v2-core/build/UniswapV2Factory.json")
        const UniswapFactory = new ethers.ContractFactory(compiledUniswapFactory.interface, compiledUniswapFactory.bytecode, signer)
        // uniswap router
        const compiledUniswapRouter = require("@uniswap/v2-periphery/build/UniswapV2Router02")
        const UniswapRouter = new ethers.ContractFactory(compiledUniswapRouter.abi, compiledUniswapRouter.bytecode, signer)
        // erc20 factory
        const compiledERC20 = require("@uniswap/v2-core/build/ERC20.json")
        const erc20Factory = new ethers.ContractFactory(compiledERC20.abi, compiledERC20.bytecode, signer)
        // setup uniswap
        const busd = await erc20Factory.deploy(pe(100000000))
        console.log('busd: ', busd.address)
        const weth = await WETH.deploy()
        console.log('weth: ', weth.address)
        const uniswapFactory = await UniswapFactory.deploy(busd.address)
        console.log('uniswapFactory: ', uniswapFactory.address)
        const uniswapRouter = await UniswapRouter.deploy(uniswapFactory.address, weth.address)
        console.log('uniswapRouter: ', uniswapRouter.address)
        await busd.approve(uniswapRouter.address, ethers.constants.MaxUint256)
        await uniswapRouter.addLiquidityETH(
            busd.address,
            '1500000000000000000000',
            '1500000000000000000000',
            '1000000000000000000',
            owner.address,
            new Date().getTime() + 100000,
            {
                value: '1000000000000000000'
            }
        )
        const pairAddresses = await uniswapFactory.allPairs(0)
        const uniswapPool = new ethers.Contract(pairAddresses, require("@uniswap/v2-core/build/UniswapV2Pair.json").abi, signer)
        console.log('uniswapPool: ', uniswapPool.address)
        // deploy PriceEmitter
        const PriceEmitter = await ethers.getContractFactory("PriceEmitter")
        const priceEmitter = await PriceEmitter.deploy()
        console.log('priceEmitter: ', priceEmitter.address)
    })
    it('deploy', async function() {
        console.log('done')
    })
})
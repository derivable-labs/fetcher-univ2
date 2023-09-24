import { ethers } from "hardhat"
import { writeFileSync } from "fs"

const pe = (x: any) => ethers.utils.parseEther(String(x))

async function main() {
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
    await priceEmitter.deployed()
    console.log('priceEmitter: ', priceEmitter.address)

    // deploy PriceEmitter
    const FetcherV2 = await ethers.getContractFactory("FetcherV2")
    const fetcher = await FetcherV2.deploy()
    await fetcher.deployed()
    console.log('fetcher: ', fetcher.address)
    writeFileSync('addresses.json', JSON.stringify({
        busd: busd.address,
        weth: weth.address,
        uniswapFactory: uniswapFactory.address,
        uniswapRouter: uniswapRouter.address,
        uniswapPool: uniswapPool.address,
        priceEmitter: priceEmitter.address,
        fetcher: fetcher.address,
    }))
    console.log('doneeee')
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
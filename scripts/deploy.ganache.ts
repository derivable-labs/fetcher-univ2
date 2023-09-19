import { ethers } from "hardhat"

const pe = (x: any) => ethers.utils.parseEther(String(x))

async function main() {
    // deploy uniswap v2
    const [owner] = await ethers.getSigners()
    const signer = owner
    // // weth test
    // const compiledWETH = require("canonical-weth/build/contracts/WETH9.json")
    // const WETH = await new ethers.ContractFactory(compiledWETH.abi, compiledWETH.bytecode, signer)
    // // uniswap factory
    // const compiledUniswapFactory = require("@uniswap/v2-core/build/UniswapV2Factory.json")
    // const UniswapFactory = await new ethers.ContractFactory(compiledUniswapFactory.interface, compiledUniswapFactory.bytecode, signer)
    // // uniswap router
    // const compiledUniswapRouter = require("@uniswap/v2-periphery/build/UniswapV2Router02")
    // const UniswapRouter = await new ethers.ContractFactory(compiledUniswapRouter.abi, compiledUniswapRouter.bytecode, signer)
    // // erc20 factory
    // const compiledERC20 = require("@uniswap/v2-core/build/ERC20.json")
    // const erc20Factory = new ethers.ContractFactory(compiledERC20.abi, compiledERC20.bytecode, signer)
    // // setup uniswap
    // const busd = await erc20Factory.deploy(pe(100000000))
    // console.log('busd: ', busd.address)
    // const weth = await WETH.deploy()
    // console.log('weth: ', weth.address)
    // const uniswapFactory = await UniswapFactory.deploy(busd.address)
    // console.log('uniswapFactory: ', uniswapFactory.address)
    // const uniswapRouter = await UniswapRouter.deploy(uniswapFactory.address, weth.address)
    // console.log('uniswapRouter: ', uniswapRouter.address)
    // await busd.approve(uniswapRouter.address, ethers.constants.MaxUint256)
    // await uniswapRouter.addLiquidityETH(
    //     busd.address,
    //     '10480444925500000000000000',
    //     '10480444925000000000000000',
    //     '6986963283651477901852',
    //     owner.address,
    //     new Date().getTime() + 100000,
    //     {
    //         value: '6986963283651477901852'
    //     }
    // )
    // const pairAddresses = await uniswapFactory.allPairs(0)
    // const uniswapPool = new ethers.Contract(pairAddresses, require("@uniswap/v2-core/build/UniswapV2Pair.json").abi, signer)
    // console.log('uniswapPool: ', uniswapPool.address)
    // deploy PriceEmitter
    const PriceEmitter = await ethers.getContractFactory("PriceEmitter")
    const priceEmitter = await PriceEmitter.deploy()
    await priceEmitter.deployed()
    console.log('priceEmitter: ', priceEmitter.address)
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
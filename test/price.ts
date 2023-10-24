import { Crypto } from '@peculiar/webcrypto'
(global as any).crypto = new Crypto()
import hre, { ethers } from "hardhat"
import * as OracleSdk from '../scripts/OracleSdk'
import * as OracleSdkAdapter from '../scripts/OracleSdkAdapter'

const SIDE_R = 0x00
const SIDE_A = 0x10
const SIDE_B = 0x20
const SIDE_C = 0x30
const PAYMENT = 0

const pe = (x: any) => ethers.utils.parseEther(String(x))
const bn = ethers.BigNumber.from
const numberToWei = (number: any, decimal = 18) => {
    if (typeof number === 'number') {
        number = number.toLocaleString('fullwide', { useGrouping: false })
    }
    return ethers.utils.parseUnits(String(number), decimal)
}
function feeToOpenRate(fee: any) {
    return bn(((1-fee)*10000).toFixed(0)).shl(128).div(10000)
}

describe('price', function () {
    let uniswapPool: any
    let fetcherV2: any
    let busd: any
    let weth: any
    let stateCalHelper: any
    let poolAddress: any
    let recipient: any
    let utr: any

    beforeEach(async function() {
        // deploy uniswap v2
        const [owner] = await ethers.getSigners()
        const signer = owner
        recipient = owner
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
        // deploy FetcherV2
        const FetcherV2 = await ethers.getContractFactory("FetcherV2")
        fetcherV2 = await FetcherV2.deploy()
        await fetcherV2.deployed()
        console.log('fetcherV2: ', fetcherV2.address)

        // deploy deri pool
        const UTR = require("@derivable/utr/build/UniversalTokenRouter.json")
        const UniversalRouter = new ethers.ContractFactory(UTR.abi, UTR.bytecode, owner)
        utr = await UniversalRouter.deploy()
        await utr.deployed()

        const compiledFeeReceiver = require("./pool_builds/FeeReceiver.json")
        const FeeReceiver = await new ethers.ContractFactory(compiledFeeReceiver.abi, compiledFeeReceiver.bytecode, signer)
        const feeReceiver = await FeeReceiver.deploy(owner.address)

        const compiledToken = require("./pool_builds/Token.json")
        const Derivable1155 = await new ethers.ContractFactory(compiledToken.abi, compiledToken.bytecode, signer)
        const derivable1155 = await Derivable1155.deploy(utr.address, owner.address, ethers.constants.AddressZero)

        const compiledPoolLogic = require("./pool_builds/PoolLogic.json")
        const PoolLogic = await new ethers.ContractFactory(compiledPoolLogic.abi, compiledPoolLogic.bytecode, signer)
        const poolLogic = await PoolLogic.deploy(derivable1155.address, feeReceiver.address, 5)

        const compiledPoolFactory = require("./pool_builds/PoolFactory.json")
        const PoolFactory = await new ethers.ContractFactory(compiledPoolFactory.abi, compiledPoolFactory.bytecode, signer)
        const poolFactory = await PoolFactory.deploy(poolLogic.address)

        const compiledTokenDescriptor = require("./pool_builds/TokenDescriptor.json")
        const TokenDescriptor = await new ethers.ContractFactory(compiledTokenDescriptor.abi, compiledTokenDescriptor.bytecode, signer)
        const tokenDescriptor = await TokenDescriptor.deploy(poolFactory.address)

        await derivable1155.setDescriptor(tokenDescriptor.address)

        const compiledHelper = require("./pool_builds/Helper.json")
        const StateCalHelper = await new ethers.ContractFactory(compiledHelper.abi, compiledHelper.bytecode, signer)
        stateCalHelper = await StateCalHelper.deploy(derivable1155.address, weth.address)

        const quoteTokenIndex =
            weth.address.toLowerCase() < busd.address.toLowerCase() ? 1 : 0
        const oracle = ethers.utils.hexZeroPad(
            bn(quoteTokenIndex)
                .shl(255)
                .add(bn(100).shl(256 - 64))
                .add(uniswapPool.address)
                .toHexString(),
            32
        )
        console.log(oracle)
        const param = {
            FETCHER: fetcherV2.address,
            ORACLE: oracle,
            TOKEN_R: weth.address,
            MARK: bn(38).shl(128),
            K: 5,
            INTEREST_HL: bn(0),
            PREMIUM_HL: bn(0),
            MATURITY: 0,
            MATURITY_VEST: 0,
            MATURITY_RATE: 0,
            OPEN_RATE: feeToOpenRate(0)
        }
        console.log(param)
        // Create Pool
        await poolFactory.callStatic.createPool(param)
        const tx = await poolFactory.createPool(param)
        const receipt = await tx.wait()
        poolAddress = ethers.utils.getAddress('0x' + receipt.logs[0].data.slice(-40))
        console.log(`pool: ${poolAddress}`)
        const poolABI = require("./pool_builds/PoolBase.json").abi
        const pool = new ethers.Contract(poolAddress, poolABI, signer)
        // Init Pool
        const state = {
            R: bn("1000000000000000000"),
            a: bn("300000000000000000"),
            b: bn("300000000000000000")
        }
        const payment = {
            utr: ethers.constants.AddressZero,
            payer: [],
            recipient: owner.address,
        }
        await weth.deposit({value: pe("1")})
        await weth.approve(poolAddress, ethers.constants.MaxUint256)
        await pool.init(state, payment)

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
                )
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
        const url = 'http://127.0.0.1:8545'
        const provider = new ethers.providers.JsonRpcProvider(url)
        const blockNumber = await provider.getBlockNumber()
        const getStorageAt = OracleSdkAdapter.getStorageAtFactory(provider)
        const getProof = OracleSdkAdapter.getProofFactory(provider)
        const getBlockByNumber = OracleSdkAdapter.getBlockByNumberFactory(provider)
        // get the proof from the SDK
        const proof = await OracleSdk.getProof(
            getStorageAt,
            getProof,
            getBlockByNumber,
            BigInt(uniswapPool.address),
            BigInt(busd.address),
            bn(blockNumber).sub(50).toBigInt()
        )
        // Connect to the network
        const contractWithSigner = fetcherV2
        const quoteTokenIndex =
            weth.address.toLowerCase() < busd.address.toLowerCase() ? 1 : 0
        const index = ethers.utils.hexZeroPad(
            bn(quoteTokenIndex)
                .shl(255)
                .add(bn(100).shl(256 - 64))
                .add(uniswapPool.address)
                .toHexString(),
            32
        )
        console.log(index)
        const receipt = await (
            await contractWithSigner.submit(index, proof, {gasLimit: 5000000})
        ).wait()
        console.log(receipt)

        await weth.deposit({value: numberToWei(0.0001)})
        await weth.approve(utr.address, ethers.constants.MaxUint256)
        await utr.exec([], [{
            inputs: [{
                mode: PAYMENT,
                eip: 20,
                token: weth.address,
                id: 0,
                amountIn: numberToWei(0.0001),
                recipient: poolAddress,
            }],
            code: stateCalHelper.address,
            data: (await stateCalHelper.populateTransaction.swap({
                sideIn: SIDE_R,
                poolIn: poolAddress,
                sideOut: SIDE_B,
                poolOut: poolAddress,
                amountIn: numberToWei(0.0001),
                payer: recipient.address,
                recipient: recipient.address,
                INDEX_R: 0
            })).data,
        }], {gasLimit: 5000000})
    })
})
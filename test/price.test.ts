import * as OracleSdk from "@keydonix/uniswap-oracle-sdk";
import hre, { ethers } from "hardhat";
import { createMemoryRpc } from "../scripts/rpc-factories";
import { ethGetBlockByNumber } from "../scripts/adapters";

const pe = (x: any) => ethers.utils.parseEther(String(x));
const bn = ethers.BigNumber.from;

describe("price", function () {
  let signer;
  let busd;
  let weth;
  let uniswapRouter;
  let uniswapPool;
  let fetcher;

  beforeEach(async function () {
    // deploy uniswap v2
    const [owner] = await ethers.getSigners();
    signer = owner;
    // weth test
    const compiledWETH = require("canonical-weth/build/contracts/WETH9.json");
    const WETH = new ethers.ContractFactory(
      compiledWETH.abi,
      compiledWETH.bytecode,
      signer
    );
    // uniswap factory
    const compiledUniswapFactory = require("@uniswap/v2-core/build/UniswapV2Factory.json");
    const UniswapFactory = new ethers.ContractFactory(
      compiledUniswapFactory.interface,
      compiledUniswapFactory.bytecode,
      signer
    );
    // uniswap router
    const compiledUniswapRouter = require("@uniswap/v2-periphery/build/UniswapV2Router02");
    const UniswapRouter = new ethers.ContractFactory(
      compiledUniswapRouter.abi,
      compiledUniswapRouter.bytecode,
      signer
    );
    // erc20 factory
    const compiledERC20 = require("@uniswap/v2-core/build/ERC20.json");
    const erc20Factory = new ethers.ContractFactory(
      compiledERC20.abi,
      compiledERC20.bytecode,
      signer
    );
    // setup uniswap
    busd = await erc20Factory.deploy(pe(100000000));
    weth = await WETH.deploy();
    const uniswapFactory = await UniswapFactory.deploy(busd.address);
    uniswapRouter = await UniswapRouter.deploy(
      uniswapFactory.address,
      weth.address
    );
    await busd.approve(uniswapRouter.address, ethers.constants.MaxUint256);
    await uniswapRouter.addLiquidityETH(
      busd.address,
      "1500000000000000000000",
      "1500000000000000000000",
      "1000000000000000000",
      owner.address,
      new Date().getTime() + 100000,
      {
        value: "1000000000000000000",
      }
    );
    const pairAddresses = await uniswapFactory.allPairs(0);
    uniswapPool = new ethers.Contract(
      pairAddresses,
      require("@uniswap/v2-core/build/UniswapV2Pair.json").abi,
      signer
    );
    // deploy PriceEmitter
    const Fetcher = await ethers.getContractFactory("FetcherV2");
    fetcher = await Fetcher.deploy();
    await (
        await uniswapRouter
          .connect(signer)
          .swapExactTokensForETH(
            pe(1),
            0,
            [busd.address, weth.address],
            owner.address,
            100000000000000
          )
      ).wait(1);
  });
  it("fetch price", async function () {
    const url = hre.network.config.url;
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
      blockNumber
    );
    // Connect to the network

    const contractWithSigner = fetcher;
    // const receipt = await (await contractWithSigner.emitPrice(addresses.uniswapPool, addresses.busd, 0n, 1n, proof, opts)).wait()
    // console.log(receipt.events[0])

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
      await contractWithSigner.submit(index, proof)
    ).wait();
    console.log(receipt.events[0]);
  });
});

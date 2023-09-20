import { ethers } from "hardhat";
import addresses from "../addresses.json";

const pe = (x: any) => ethers.utils.parseEther(String(x));

(async function main() {
  // deploy uniswap v2
  const [owner] = await ethers.getSigners();
  const signer = owner;

  const compiledUniswapRouter = require("@uniswap/v2-periphery/build/UniswapV2Router02");
  const uniswapRouter = new ethers.Contract(
    addresses.uniswapRouter,
    compiledUniswapRouter.abi
  );

  await (
    await uniswapRouter
      .connect(signer)
      .swapExactTokensForETH(
        pe(1),
        0,
        [addresses.busd, addresses.weth],
        owner.address,
        100000000000000
      )
  ).wait(1);
})();

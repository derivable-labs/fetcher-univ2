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

  const blocks = 100

  for (let index = 0; index < blocks; index++) {
    await uniswapRouter
      .connect(signer)
      .swapExactTokensForETH(
        pe(Math.floor(Math.random() * 11) + 1),
        0,
        [addresses.busd, addresses.weth],
        owner.address,
        100000000000000,
        { gasLimit: 5000000 }
      );
    await ethers.provider.send("evm_increaseTime", [3]);
    await ethers.provider.send("evm_mine", []);
    await uniswapRouter
      .connect(signer)
      .swapExactETHForTokens(
        0,
        [addresses.weth, addresses.busd],
        owner.address,
        100000000000000,
        {
          value: pe(Math.floor(Math.random() * 11) + 1),
          gasLimit: 5000000,
        }
      );
    await ethers.provider.send("evm_increaseTime", [3]);
    await ethers.provider.send("evm_mine", []);
  }
  console.log(`Swap monkey ${blocks} blocks done!`)
})();

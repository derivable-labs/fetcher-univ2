const { ethers } = require("hardhat")

async function main() {
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
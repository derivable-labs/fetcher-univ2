const hre = require('hardhat')
const ethers = hre.ethers

let opts: any = {
    gasLimit: 5000000
}
async function main() {
    const bytecode = require('../artifacts/contracts/FetcherV2.sol/FetcherV2.json').bytecode
    const salt = 0
    const saltHex = ethers.utils.hexZeroPad(ethers.utils.hexlify(salt), 32)
    const SingletonFactoryABI = require('./abi/SingletonFactoryABI.json')
    const url = hre.network.config.url
    // Connect to the network
    const provider = new ethers.providers.JsonRpcProvider(url)
    const singletonFactoryAddress = '0xce0042B868300000d44A59004Da54A005ffdcf9f'
    const contract = new ethers.Contract(singletonFactoryAddress, SingletonFactoryABI, provider)
    const wallet = new ethers.Wallet(hre.network.config.accounts[0], provider)
    const contractWithSigner = contract.connect(wallet)
    opts.gasPrice = hre.network.config.gasPrice
    console.log(wallet.address, opts)
    try {
        const deployTx = await contractWithSigner.deploy(bytecode, saltHex, opts)
        console.log('Tx: ', deployTx.hash)
        const res = await deployTx.wait(1)
        console.log('Result: ', res)
    } catch (err) {
        // @ts-ignore
        console.error('Error:', err?.reason ?? err)
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
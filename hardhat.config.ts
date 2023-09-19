import { HardhatUserConfig } from "hardhat/config";

import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-ganache"

const config: HardhatUserConfig = {
    defaultNetwork: 'ganache',
    solidity: {
        compilers: [
            {
                version: "0.6.8",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 1000000,
                    },
                },
            }
        ]
    },
    networks: {
        hardhat: {
            accounts: [
                {
                    privateKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
                    balance: "900000000000000000000000000000000000000",
                },
                {
                    privateKey: '0x0000000000000000000000000000000000000000000000000000000000000002',
                    balance: "900000000000000000000000000000000000000",
                },
                {
                    privateKey: '0x0000000000000000000000000000000000000000000000000000000000000003',
                    balance: "900000000000000000000000000000000000000",
                },
            ]
        },
        arbmainnet: {
            url: process.env.ARB_MAINNET_PROVIDER ?? 'https://arb1.arbitrum.io/rpc',
            accounts: [
                process.env.MAINNET_DEPLOYER ?? '0x0000000000000000000000000000000000000000000000000000000000000001',
            ],
            timeout: 900000,
            chainId: 42161
        },
        arbtestnet: {
            url: process.env.ARB_TESTNET_PROVIDER ?? 'https://endpoints.omniatech.io/v1/arbitrum/goerli/public',
            accounts: [
                process.env.TESTNET_DEPLOYER ?? '0x0000000000000000000000000000000000000000000000000000000000000001',
            ],
            timeout: 20000,
            chainId: 421613
        },
        optestnet: {
            url: process.env.OP_TESTNET_PROVIDER ?? 'https://goerli.optimism.io',
            accounts: [
                process.env.TESTNET_DEPLOYER ?? '0x0000000000000000000000000000000000000000000000000000000000000001',
            ],
            timeout: 20000,
            chainId: 420
        },
        basetestnet: {
            url: process.env.BASE_TESTNET_PROVIDER ?? 'https://goerli.base.org',
            accounts: [
                process.env.TESTNET_DEPLOYER ?? '0x0000000000000000000000000000000000000000000000000000000000000001',
            ],
            timeout: 20000,
            chainId: 84531
        },
        basemainnet: {
            url: process.env.BASE_MAINNET_PROVIDER ?? 'https://mainnet.base.org',
            accounts: [
                process.env.MAINNET_DEPLOYER ?? '0x0000000000000000000000000000000000000000000000000000000000000001',
            ],
            timeout: 20000,
            chainId: 8453
        },
        ganacheservice: {
            url: 'http://127.0.0.1:8545',
            // kick balcony people guess oppose verb faint explain spoil learn that pool
            accounts: [
                '60f5906de1edfc4d14eb4aea49ed4c06641bbdbd5a56092392308e9730598373',
                '70ddda4400c15d2daa517f858defab22c8a5d9adeaf3d74caa5ca86a5959ddd9'
            ],
            timeout: 900000,
            chainId: 1337
        },
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY,
    },
    mocha: {
        timeout: 100000000
    },
    contractSizer: {
        alphaSort: true,
        disambiguatePaths: false,
        runOnCompile: true,
        strict: true,
        only: [],
    }
};
export default config;

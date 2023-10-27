import { rlpEncode, rlpDecode } from '@zoltu/rlp-encoder'
import { stripLeadingZeros, stringToAddress,hexStringToUint8Array } from './utils'
import { ethers } from 'ethers'

const bn = ethers.BigNumber.from

export interface Proof {
	readonly block: Uint8Array
	readonly accountProofNodesRlp: Uint8Array
	readonly reserveAndTimestampProofNodesRlp: Uint8Array
	readonly priceAccumulatorProofNodesRlp: Uint8Array
}

export type ProofResult = {
	readonly accountProof: readonly Uint8Array[]
	readonly storageProof: readonly {
		readonly key: string
		readonly value: string
		readonly proof: readonly Uint8Array[]
	}[]
}

export type Block = {
	readonly parentHash: string
	readonly sha3Uncles: string
	readonly miner: string
	readonly stateRoot: string
	readonly transactionsRoot: string
	readonly receiptsRoot: string
	readonly logsBloom: string
	readonly difficulty: string
	readonly number: string
	readonly gasLimit: string
	readonly gasUsed: string
	readonly timestamp: string
	readonly extraData: Uint8Array
	readonly mixHash: string | undefined
	readonly nonce: string | null
    readonly baseFeePerGas: string | null
}

export type EthGetStorageAt = (address: string, position: number, block: number | 'latest') => Promise<string>
export type EthGetProof = (address: string, positions: readonly number[], block: number) => Promise<ProofResult>
export type EthGetBlockByNumber = (blockNumber: number | 'latest') => Promise<Block | null>

export async function getPrice(eth_getStorageAt: EthGetStorageAt, eth_getBlockByNumber: EthGetBlockByNumber, exchangeAddress: string, denominationToken: string, blockNumber: number): Promise<ethers.BigNumber> {
	async function getAccumulatorValue(innerBlockNumber: number, timestamp: number) {
		const token0 = stringToAddress(await eth_getStorageAt(exchangeAddress, 6, innerBlockNumber))
		const token1 = stringToAddress(await eth_getStorageAt(exchangeAddress, 7, innerBlockNumber))
		const reservesAndTimestamp = await eth_getStorageAt(exchangeAddress, 8, innerBlockNumber)
		const accumulator0 = bn(await eth_getStorageAt(exchangeAddress, 9, innerBlockNumber))
		const accumulator1 = bn(await eth_getStorageAt(exchangeAddress, 10, innerBlockNumber))
		const blockTimestampLast = bn('0x' + reservesAndTimestamp.substring(2, reservesAndTimestamp.length - 224/4))
		const reserve1 = bn('0x' + reservesAndTimestamp.substring(10, reservesAndTimestamp.length - 112/4))
		const reserve0 = bn('0x' + reservesAndTimestamp.substring(38, reservesAndTimestamp.length))
		if (token0 !== denominationToken && token1 !== denominationToken) throw new Error(`Denomination token ${denominationToken} is not one of the tokens for exchange ${exchangeAddress}`)
		if (reserve0.eq(0)) throw new Error(`Exchange ${exchangeAddress} does not have any reserves for token0.`)
		if (reserve1.eq(0)) throw new Error(`Exchange ${exchangeAddress} does not have any reserves for token1.`)
		if (blockTimestampLast.eq(0)) throw new Error(`Exchange ${exchangeAddress} has not had its first accumulator update (or it is year 2106).`)
		if (accumulator0.eq(0)) throw new Error(`Exchange ${exchangeAddress} has not had its first accumulator update (or it is 136 years since launch).`)
		if (accumulator1.eq(0)) throw new Error(`Exchange ${exchangeAddress} has not had its first accumulator update (or it is 136 years since launch).`)
		const numeratorReserve = (token0 === denominationToken) ? reserve0 : reserve1
		const denominatorReserve = (token0 === denominationToken) ? reserve1 : reserve0
		const accumulator = (token0 === denominationToken) ? accumulator1 : accumulator0
		const timeElapsedSinceLastAccumulatorUpdate = bn(timestamp).sub(blockTimestampLast)
		const priceNow = numeratorReserve.mul(bn(2).pow(bn(112))).div(denominatorReserve)
		return timeElapsedSinceLastAccumulatorUpdate.mul(priceNow).add(accumulator)
	}
	const latestBlock = await eth_getBlockByNumber('latest')
	if (latestBlock === null) throw new Error(`Block 'latest' does not exist.`)
	const historicBlock = await eth_getBlockByNumber(blockNumber)
	if (historicBlock === null) throw new Error(`Block ${blockNumber} does not exist.`)
	const latestAccumulator = await getAccumulatorValue(Number(latestBlock.number), Number(latestBlock.timestamp))
	const historicAccumulator = await getAccumulatorValue(blockNumber, Number(historicBlock.timestamp))
	const accumulatorDelta = latestAccumulator.sub(historicAccumulator)
	const timeDelta = bn(latestBlock.timestamp).sub(bn(historicBlock.timestamp))
	return accumulatorDelta.div(timeDelta)
}

export async function getAccumulatorPrice(eth_getStorageAt: EthGetStorageAt, eth_getBlockByNumber: EthGetBlockByNumber, exchangeAddress: string, denominationToken: string, blockNumber: number): Promise<ethers.BigNumber> {
	async function getAccumulatorValue(innerBlockNumber: number) {
		const token0 = stringToAddress(await eth_getStorageAt(exchangeAddress, 6, innerBlockNumber))
		const token1 = stringToAddress(await eth_getStorageAt(exchangeAddress, 7, innerBlockNumber))
		const reservesAndTimestamp = bn(await eth_getStorageAt(exchangeAddress, 8, innerBlockNumber))
		const accumulator0 = bn(await eth_getStorageAt(exchangeAddress, 9, innerBlockNumber))
		const accumulator1 = bn(await eth_getStorageAt(exchangeAddress, 10, innerBlockNumber))
		const blockTimestampLast = reservesAndTimestamp.shr(224)
		const reserve1 = reservesAndTimestamp.shr(112).and(bn(2).pow(112).sub(1))
		const reserve0 = reservesAndTimestamp.and(bn(2).pow(112).sub(1))
		if (token0 !== denominationToken && token1 !== denominationToken) throw new Error(`Denomination token ${denominationToken} is not one of the tokens for exchange ${exchangeAddress}`)
		if (reserve0.eq(0)) throw new Error(`Exchange ${exchangeAddress} does not have any reserves for token0.`)
		if (reserve1.eq(0)) throw new Error(`Exchange ${exchangeAddress} does not have any reserves for token1.`)
		if (blockTimestampLast.eq(0)) throw new Error(`Exchange ${exchangeAddress} has not had its first accumulator update (or it is year 2106).`)
		if (accumulator0.eq(0)) throw new Error(`Exchange ${exchangeAddress} has not had its first accumulator update (or it is 136 years since launch).`)
		if (accumulator1.eq(0)) throw new Error(`Exchange ${exchangeAddress} has not had its first accumulator update (or it is 136 years since launch).`)
		const accumulator = (token0 === denominationToken) ? accumulator1 : accumulator0
		return accumulator
	}
	const historicBlock = await eth_getBlockByNumber(blockNumber)
	if (historicBlock === null) throw new Error(`Block ${blockNumber} does not exist.`)
	const historicAccumulator = await getAccumulatorValue(blockNumber)
	return historicAccumulator
}

export async function getProof(eth_getStorageAt: EthGetStorageAt, eth_getProof: EthGetProof, eth_getBlockByNumber: EthGetBlockByNumber, exchangeAddress: string, denominationToken: string, blockNumber: number): Promise<Proof> {
	const token0Address = stringToAddress(await eth_getStorageAt(exchangeAddress, 6, 'latest'))
	const token1Address = stringToAddress(await eth_getStorageAt(exchangeAddress, 7, 'latest'))
	if (denominationToken !== token0Address && denominationToken !== token1Address) throw new Error(`Denomination token ${denominationToken} is not one of the two tokens for the Uniswap exchange at ${exchangeAddress}`)
	const priceAccumulatorSlot = (denominationToken === token0Address) ? 10 : 9
	const proof = await eth_getProof(exchangeAddress, [8, priceAccumulatorSlot], blockNumber)
	const block = await eth_getBlockByNumber(blockNumber)
	if (block === null) throw new Error(`Received null for block ${Number(blockNumber)}`)
	const blockRlp = rlpEncodeBlock(block)
	const accountProofNodesRlp = rlpEncode(proof.accountProof.map(rlpDecode))
	const reserveAndTimestampProofNodesRlp = rlpEncode(proof.storageProof[0].proof.map(rlpDecode))
	const priceAccumulatorProofNodesRlp = rlpEncode(proof.storageProof[1].proof.map(rlpDecode))
	return {
		block: blockRlp,
		accountProofNodesRlp,
		reserveAndTimestampProofNodesRlp,
		priceAccumulatorProofNodesRlp,
	}
}

function rlpEncodeBlock(block: Block) {
	return rlpEncode([
		hexStringToUint8Array(block.parentHash),
		hexStringToUint8Array(block.sha3Uncles),
		hexStringToUint8Array(block.miner),
		hexStringToUint8Array(block.stateRoot),
		hexStringToUint8Array(block.transactionsRoot),
		hexStringToUint8Array(block.receiptsRoot),
		hexStringToUint8Array(block.logsBloom),
		stripLeadingZeros(hexStringToUint8Array(block.difficulty)),
		stripLeadingZeros(hexStringToUint8Array(block.number)),
		stripLeadingZeros(hexStringToUint8Array(block.gasLimit)),
		stripLeadingZeros(hexStringToUint8Array(block.gasUsed)),
		stripLeadingZeros(hexStringToUint8Array(block.timestamp)),
		stripLeadingZeros(block.extraData),
		...(block.mixHash != null ? [hexStringToUint8Array(block.mixHash)] : []),
		...(block.nonce != null ? [hexStringToUint8Array(block.nonce)] : []),
        ...(block.baseFeePerGas != null ? [stripLeadingZeros(hexStringToUint8Array(block.baseFeePerGas))] : []),
	])
}
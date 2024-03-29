import { Block } from './OracleSdk'
import { FetchJsonRpc } from '@zoltu/solidity-typescript-generator-fetch-dependencies'
import { SignerFetchRpc } from './rpc-factories'

export async function ethGetBlockByNumber(rpc: SignerFetchRpc, blockNumber: bigint | 'latest'): Promise<Block | null> {
	const result = await rpc.getBlockByNumber(false, blockNumber)
	if (result === null) throw new Error(`Unknown block number ${blockNumber}`)
	if (result.logsBloom === null) throw new Error(`Block ${blockNumber} was missing 'logsBloom' field.`)
	if (result.number === null) throw new Error(`Block ${blockNumber} was missing 'number' field.`)
	return {
		...result,
		logsBloom: result.logsBloom,
		number: result.number,
		timestamp: BigInt(result.timestamp.getTime() / 1000),
		mixHash: result.mixHash !== null ? result.mixHash : undefined,
	}
}

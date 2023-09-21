const fs = require('fs')

const path = 'node_modules/@keydonix/uniswap-oracle-sdk/output-cjs/index.js'
const original = fs.readFileSync( path, 'utf8' );

if (original.includes('baseFeePerGas')) {
    console.warn('File already patched. Nothing to do.')
    return
}

const funcIndex = original.indexOf('function rlpEncodeBlock(block)')
const endIndex = original.indexOf(']);', funcIndex)

const patched = original.substring(0, endIndex)
    + `    ...(block.baseFeePerGas != null ? [utils_1.stripLeadingZeros(utils_1.unsignedIntegerToUint8Array(block.baseFeePerGas, 32))] : []),\n    `
    + original.substring(endIndex)

fs.writeFileSync(path, patched)

console.log('Successfully patched. Ready to go.')

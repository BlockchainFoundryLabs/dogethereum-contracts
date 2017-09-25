pragma solidity ^0.4.4;

import "./DogeChain.sol";
import "./Constants.sol";

contract DogeRelay is DogeChain {

	// a Bitcoin block (header) is stored as:
	// - _blockHeader 80 bytes
	// - _info who's 32 bytes are comprised of "_height" 8bytes, "_ibIndex" 8bytes, "_score" 16bytes
	// -   "_height" is 1 more than the typical Bitcoin term height/blocknumber [see setInitialParent()]
	// -   "_ibIndex" is the block's index to internalBlock (see btcChain)
	// -   "_score" is 1 more than the chainWork [see setInitialParent()]
	// - _ancestor stores 8 32bit ancestor indices for more efficient backtracking (see btcChain)
	// - _feeInfo is used for incentive.se (see m_getFeeInfo)
	struct BlockInformation {
				bytes _blockHeader;
				uint _info;
	      uint _ancestor;
	      // bytes _feeInfo;

	}
	mapping (bytes32 => BlockInformation) myblocks;

	// block with the highest score (aka the Tip of the blockchain)
	bytes32 heaviestBlock;

	// highest score among all blocks (so far)
	uint highScore;


	event StoreHeader(uint indexed blockHash, int indexed returnCode);
	event GetHeader(uint indexed blockHash, int indexed returnCode);
	event VerifyTransaction(uint indexed txHash, int indexed returnCode);
	event RelayTransaction(uint indexed txHash, int indexed returnCode);

  function DogeRelay() {
    // gasPriceAndChangeRecipientFee in incentive.se
    // TODO incentive management
    // self.gasPriceAndChangeRecipientFee = 50 * 10**9 * BYTES_16 // 50 shannon and left-align
  }



	// setInitialParent can only be called once and allows testing of storing
	// arbitrary headers and verifying/relaying transactions,
	// say from block 1.900.000, instead of genesis block
	//
	// setInitialParent should be called using a real block on the Dogecoin blockchain.
	// http://bitcoin.stackexchange.com/questions/26869/what-is-chainwork
	// chainWork can be computed using test/script.chainwork.py or
	// https://chainquery.com/bitcoin-api/getblock or local dogecoind
	//
	// Note: If used to store the imaginary block before Dogecoin's
	// genesis, then it should be called as setInitialParent(0, 0, 1) and
	// means that getLastBlockHeight() and getChainWork() will be
	// 1 more than the usual: eg Dogecoin's genesis has height 1 instead of 0
	// setInitialParent(0, 0, 1) is only for testing purposes and a TransactionFailed
	// error will happen when the first block divisible by 2016 is reached, because
	// difficulty computation requires looking up the 2016th parent, which will
	// NOT exist with setInitialParent(0, 0, 1) (only the 2015th parent exists)
	function setInitialParent(bytes32 blockHash, uint height, uint chainWork) returns (bool) {
	    // reuse highScore as the flag for whether setInitialParent() has already been called
	    if (highScore != 0) {
	        return false;	    
	    } else {
	        highScore = 1  // matches the score that is set below in this function	    
	    }

	    // TODO: check height > 145000, that is when Digishield was activated. The problem is that is only for production

	    heaviestBlock = blockHash;

	    // _height cannot be set to -1 because inMainChain() assumes that
	    // a block with height 0 does NOT exist (thus we cannot allow the
	    // real genesis block to be at height 0)
	    m_setHeight(blockHash, height);

	    // do NOT pass chainWork of 0, since score 0 means
	    // block does NOT exist. see check in storeBlockHeader()
	    m_setScore(blockHash, chainWork);

	    // other fields do not need to be set, for example:
	    // _ancestor can remain zeros because internalBlock[0] already points to blockHash

	    return true;
	}



	// Where the header begins
	uint8 constant OFFSET_ABI: 68  // 4 bytes function ID, then 2 32bytes before the header begins

	// store a Dogecoin block header that must be provided in bytes format 'blockHeaderBytes'
	// Callers must keep same signature since CALLDATALOAD is used to save gas.
	function storeBlockHeader(bytes blockHeaderBytes) returns (uint) {}
			bytes32 hashPrevBlockReverted;
			assembly {
				hashPrevBlockReverted := calldataload(OFFSET_ABI+4) // 4 is offset for hashPrevBlock
			}
	    bytes32 hashPrevBlock = flip32Bytes(hashPrevBlockReverted);  
	    // blockHash should be a function parameter in dogecoin because the hash can not be calculated onchain
	    bytes32 blockHash = m_dblShaFlip(blockHeaderBytes);

	    scorePrevBlock = m_getScore(hashPrevBlock);
	    if (!scorePrevBlock) {
	        StoreHeader(blockHash, ERR_NO_PREV_BLOCK);
	        return 0;
	    }

	    scoreBlock = m_getScore(blockHash);
	    if (scoreBlock != 0) {
					// block already stored/exists
	        StoreHeader(blockHash, ERR_BLOCK_ALREADY_EXISTS);
	        return 0;
	    }

			bytes32 wordWithBits;
			bytes4 bits;
			assembly {
				wordWithBits = calldataload(OFFSET_ABI+72)  // 72 is offset for 'bits'
				bits = add( byte(0, wordWithBits) , add( mul(byte(1, wordWithBits),BYTES_1) , add( mul(byte(2, wordWithBits),BYTES_2) , mul(byte(3, wordWithBits),BYTES_3) ) ) )
			}
	    target = targetFromBits(bits);

	    // we only check the target and do not do other validation (eg timestamp) to save gas
	    if (blockHash < 0 || blockHash > target) {
		    StoreHeader (blockHash, ERR_PROOF_OF_WORK);
		    return 0;
		  }


      uint blockHeight = 1 + m_getHeight(hashPrevBlock);
      bytes4 prevBits = m_getBits(hashPrevBlock);
      if (!m_difficultyShouldBeAdjusted(blockHeight) || ibIndex == 1) {
          // since blockHeight is 1 more than blockNumber; OR clause is special case for 1st header
          // we need to check prevBits isn't 0 otherwise the 1st header
          // will always be rejected (since prevBits doesn't exist for the initial parent)
          // This allows blocks with arbitrary difficulty from being added to
          // the initial parent, but as these forks will have lower score than
          // the main chain, they will not have impact.
          if (bits != prevBits && prevBits != 0) {
              StoreHeader(blockHash, ERR_DIFFICULTY);
              return 0;          
          }
      } else {
          prevTarget = targetFromBits(prevBits);
          prevTime = m_getTimestamp(hashPrevBlock);

          // (blockHeight - DIFFICULTY_ADJUSTMENT_INTERVAL) is same as [getHeight(hashPrevBlock) - (DIFFICULTY_ADJUSTMENT_INTERVAL - 1)]
          startBlock = priv_fastGetBlockHash__(blockHeight - DIFFICULTY_ADJUSTMENT_INTERVAL);
          startTime = m_getTimestamp(startBlock);

          newBits = m_computeNewBits(prevTime, startTime, prevTarget);
          if bits != newBits && newBits != 0:  // newBits != 0 to allow first header
              log(type=StoreHeader, blockHash, ERR_RETARGET)
              return(0)
      }        

      m_saveAncestors(blockHash, hashPrevBlock)  // increments ibIndex

      save(self.block[blockHash]._blockHeader[0], blockHeaderBytes, chars=80)

      difficulty = 0x00000000FFFF0000000000000000000000000000000000000000000000000000 / target // https://en.bitcoin.it/wiki/Difficulty
      scoreBlock = scorePrevBlock + difficulty
      m_setScore(blockHash, scoreBlock)

      // equality allows block with same score to become an (alternate) Tip, so that
      // when an (existing) Tip becomes stale, the chain can continue with the alternate Tip
      if scoreBlock >= self.highScore:
          self.heaviestBlock = blockHash
          self.highScore = scoreBlock

      log(type=StoreHeader, blockHash, blockHeight)
      return(blockHeight)
  }


/*





	// Returns the hash of tx (raw bytes) if the tx is in the block given by 'txBlockHash'
	// and the block is in Bitcoin's main chain (ie not a fork).
	// Returns 0 if the tx is exactly 64 bytes long (to guard against a Merkle tree
	// collision) or fails verification.
	//
	// the merkle proof is represented by 'txIndex', 'sibling', where:
	// - 'txIndex' is the index of the tx within the block
	// - 'sibling' are the merkle siblings of tx
	def verifyTx(txBytes:str, txIndex, sibling:arr, txBlockHash):
	    txHash = m_dblShaFlip(txBytes)
	    if len(txBytes) == 64:  // todo: is check 32 also needed?
	        log(type=VerifyTransaction, txHash, ERR_TX_64BYTE)
	        return(0:uint256)
	    res = self.helperVerifyHash__(txHash, txIndex, sibling, txBlockHash, value=msg.value)
	    if res == 1:
	        return(txHash:uint256)
	    else:
	        // log is done via helperVerifyHash__
	        return(0:uint256)


	// Returns 1 if txHash is in the block given by 'txBlockHash' and the block is
	// in Bitcoin's main chain (ie not a fork)
	// Note: no verification is performed to prevent txHash from just being an
	// internal hash in the Merkle tree. Thus this helper method should NOT be used
	// directly and is intended to be private.
	//
	// the merkle proof is represented by 'txHash', 'txIndex', 'sibling', where:
	// - 'txHash' is the hash of the tx
	// - 'txIndex' is the index of the tx within the block
	// - 'sibling' are the merkle siblings of tx
	def helperVerifyHash__(txHash:uint256, txIndex, sibling:arr, txBlockHash):
	    if !self.feePaid(txBlockHash, m_getFeeAmount(txBlockHash), value=msg.value):  // in incentive.se
	        log(type=VerifyTransaction, txHash, ERR_BAD_FEE)
	        return(ERR_BAD_FEE)

	    if self.within6Confirms(txBlockHash):
	        log(type=VerifyTransaction, txHash, ERR_CONFIRMATIONS)
	        return(ERR_CONFIRMATIONS)

	    if !self.priv_inMainChain__(txBlockHash):
	        log(type=VerifyTransaction, txHash, ERR_CHAIN)
	        return(ERR_CHAIN)

	    merkle = self.computeMerkle(txHash, txIndex, sibling)
	    realMerkleRoot = getMerkleRoot(txBlockHash)

	    if merkle == realMerkleRoot:
	        log(type=VerifyTransaction, txHash, 1)
	        return(1)

	    log(type=VerifyTransaction, txHash, ERR_MERKLE_ROOT)
	    return(ERR_MERKLE_ROOT)


	// relays transaction to target 'contract' processTransaction() method.
	// returns and logs the value of processTransaction(), which is an int256.
	//
	// if the transaction does not pass verification, error code ERR_RELAY_VERIFY
	// is logged and returned.
	// Note: callers cannot be 100% certain when an ERR_RELAY_VERIFY occurs because
	// it may also have been returned by processTransaction(). callers should be
	// aware of the contract that they are relaying transactions to and
	// understand what that contract's processTransaction method returns.
	def relayTx(txBytes:str, txIndex, sibling:arr, txBlockHash, contract):
	    txHash = self.verifyTx(txBytes, txIndex, sibling, txBlockHash, value=msg.value)
	    if txHash != 0:
	        returnCode = contract.processTransaction(txBytes, txHash)
	        log(type=RelayTransaction, txHash, returnCode)
	        return(returnCode)

	    log(type=RelayTransaction, 0, ERR_RELAY_VERIFY)
	    return(ERR_RELAY_VERIFY)


	// return the hash of the heaviest block aka the Tip
	def getBlockchainHead():
	    return(self.heaviestBlock)


	// return the height of the heaviest block aka the Tip
	def getLastBlockHeight():
	    return(m_lastBlockHeight())


	// return the chainWork of the Tip
	// http://bitcoin.stackexchange.com/questions/26869/what-is-chainwork
	def getChainWork():
	    return(m_getScore(self.heaviestBlock))


	// return the difference between the chainWork at
	// the blockchain Tip and its 10th ancestor
	//
	// this is not needed by the relay itself, but is provided in
	// case some contract wants to use the chainWork or Bitcoin network
	// difficulty (which can be derived) as a data feed for some purpose
	def getAverageChainWork():
	    blockHash = self.heaviestBlock

	    chainWorkTip = m_getScore(blockHash)

	    i = 0
	    while i < 10:
	        blockHash = getPrevBlock(blockHash)
	        i += 1

	    chainWork10Ancestors = m_getScore(blockHash)

	    return(chainWorkTip - chainWork10Ancestors)


	// For a valid proof, returns the root of the Merkle tree.
	// Otherwise the return value is meaningless if the proof is invalid.
	// [see documentation for verifyTx() for the merkle proof
	// format of 'txHash', 'txIndex', 'sibling' ]
	def computeMerkle(txHash, txIndex, sibling:arr):
	    resultHash = txHash
	    proofLen = len(sibling)
	    i = 0
	    while i < proofLen:
	        proofHex = sibling[i]

	        sideOfSibling = txIndex % 2  // 0 means sibling is on the right; 1 means left

	        if sideOfSibling == 1:
	            left = proofHex
	            right = resultHash
	        elif sideOfSibling == 0:
	            left = resultHash
	            right = proofHex

	        resultHash = concatHash(left, right)

	        txIndex /= 2
	        i += 1

	    return(resultHash:uint256)


	// returns 1 if the 'txBlockHash' is within 6 blocks of self.heaviestBlock
	// otherwise returns 0.
	// note: return value of 0 does NOT mean 'txBlockHash' has more than 6
	// confirmations; a non-existent 'txBlockHash' will lead to a return value of 0
	def within6Confirms(txBlockHash):
	    blockHash = self.heaviestBlock

	    i = 0
	    while i < 6:
	        if txBlockHash == blockHash:
	            return(1)

	        // blockHash = self.block[blockHash]._prevBlock
	        blockHash = getPrevBlock(blockHash)
	        i += 1

	    return(0)


	// returns the 80-byte header (zeros for a header that does not exist) when
	// sufficient payment is provided.  If payment is insufficient, returns 1-byte of zero.
	def getBlockHeader(blockHash):
	    if !self.feePaid(blockHash, m_getFeeAmount(blockHash), value=msg.value):  // in incentive.se
	        log(type=GetHeader, blockHash, 0)
	        return(text("\x00"):str)

	    log(type=GetHeader, blockHash, 1)
	    return(load(self.block[blockHash]._blockHeader[0], chars=80):str)


	// The getBlockHash(blockHeight) method has been removed because it could be
	// used by a leecher contract (test/btcrelay_leech.se for sample) to
	// trustlessly provide the BTC Relay service, without rewarding the
	// submitters of block headers, who provide a critical service.
	// To iterate through the "blockchain" of BTC Relay, getBlockchainHead() can
	// be used with getBlockHeader().  Once a header is obtained, its 4th byte
	// contains the hash of the previous block, which can then be passed again
	// to getBlockHeader().  This is how another contract can access BTC Relay's
	// blockchain trustlessly, but each getBlockHeader() invocation potentially
	// requires payment.
	// As usual, UIs and eth_call with getBlockHeader() will not need any fees at all
	// (even though sufficient 'value', by using getFeeAmount(blockHash),
	// must still be provided).


	// TODO is an API like getInitialParent() needed? it could be obtained using
	// something like web3.eth.getStorageAt using index 0


	//
	// macros
	// (when running tests, ensure the testing macro overrides have the
	// same signatures as the actual macros, otherwise tests will fail with
	// an obscure message such as tester.py:201: TransactionFailed)
	//


	macro m_difficultyShouldBeAdjusted($blockHeight):
	    mod($blockHeight, DIFFICULTY_ADJUSTMENT_INTERVAL) == 0


	macro m_computeNewBits($prevTime, $startTime, $prevTarget):
	    with $actualTimespan = $prevTime - $startTime:
	        if $actualTimespan < TARGET_TIMESPAN_DIV_4:
	            $actualTimespan = TARGET_TIMESPAN_DIV_4
	        if $actualTimespan > TARGET_TIMESPAN_MUL_4:
	            $actualTimespan = TARGET_TIMESPAN_MUL_4

	        with $newTarget = div($actualTimespan * $prevTarget, TARGET_TIMESPAN):
	            if $newTarget > UNROUNDED_MAX_TARGET:
	                $newTarget = UNROUNDED_MAX_TARGET
	            m_toCompactBits($newTarget)


	// Convert uint256 to compact encoding
	// based on https://github.com/petertodd/python-bitcoinlib/blob/2a5dda45b557515fb12a0a18e5dd48d2f5cd13c2/bitcoin/core/serialize.py
	macro m_toCompactBits($val):
	    with $nbytes = m_shiftRight((m_bitLen($val) + 7), 3):
	        with $compact = 0:
	            if $nbytes <= 3:
	                $compact = m_shiftLeft(($val & 0xFFFFFF), 8 * (3 - $nbytes))
	            else:
	                $compact = m_shiftRight($val, 8 * ($nbytes - 3))
	                $compact = $compact & 0xFFFFFF

	            // If the sign bit (0x00800000) is set, divide the mantissa by 256 and
	            // increase the exponent to get an encoding without it set.
	            if $compact & 0x00800000:
	                $compact = m_shiftRight($compact, 8)
	                $nbytes += 1

	            $compact | m_shiftLeft($nbytes, 24)


	// get the parent of '$blockHash'
	macro getPrevBlock($blockHash):
	    with $addr = ref(self.block[$blockHash]._blockHeader[0]):
	        // sload($addr) gets first 32bytes
	        // * BYTES_4 shifts over to skip the 4bytes of blockversion
	        // At this point we have the first 28bytes of hashPrevBlock and we
	        // want to get the remaining 4bytes so we:
	        // sload($addr+1) get the second 32bytes
	        //     but we only want the first 4bytes so div 28bytes
	        // The single line statement can be interpreted as:
	        // get the last 28bytes of the 1st chunk and combine (add) it to the
	        // first 4bytes of the 2nd chunk,
	        // where chunks are read in sizes of 32bytes via sload
	        flip32Bytes(sload($addr) * BYTES_4 + div(sload($addr+1), BYTES_28))  // must use div()


	// get the timestamp from a Bitcoin blockheader
	macro m_getTimestamp($blockHash):
	    with $addr = ref(self.block[$blockHash]._blockHeader[0]):
	        // get the 3rd chunk
	        $tmp = sload($addr+2)
	    // the timestamp are the 4th to 7th bytes of the 3rd chunk, but we also have to flip them
	    BYTES_3*byte(7, $tmp) + BYTES_2*byte(6, $tmp) + BYTES_1*byte(5, $tmp) + byte(4, $tmp)


	// get the 'bits' field from a Bitcoin blockheader
	macro m_getBits($blockHash):
	    with $addr = ref(self.block[$blockHash]._blockHeader[0]):
	        // get the 3rd chunk
	        $tmp = sload($addr+2)
	    // the 'bits' are the 8th to 11th bytes of the 3rd chunk, but we also have to flip them
	    BYTES_3*byte(11, $tmp) + BYTES_2*byte(10, $tmp) + BYTES_1*byte(9, $tmp) + byte(8, $tmp)


	// get the merkle root of '$blockHash'
	macro getMerkleRoot($blockHash):
	    with $addr = ref(self.block[$blockHash]._blockHeader[0]):
	        flip32Bytes(sload($addr+1) * BYTES_4 + div(sload($addr+2), BYTES_28))  // must use div()


	macro m_lastBlockHeight():
	    m_getHeight(self.heaviestBlock)


	// Bitcoin-way of hashing
	macro m_dblShaFlip($dataBytes):
	    flip32Bytes(sha256(sha256($dataBytes:str)))


	// Bitcoin-way of computing the target from the 'bits' field of a blockheader
	// based on http://www.righto.com/2014/02/bitcoin-mining-hard-way-algorithms.html//ref3
	macro targetFromBits($bits):
	    $exp = div($bits, 0x1000000)  // 2^24
	    $mant = $bits & 0xffffff
	    $mant * 256^($exp - 3)


	// Bitcoin-way merkle parent of transaction hashes $tx1 and $tx2
	macro concatHash($tx1, $tx2):
	    with $x = ~alloc(64):
	        ~mstore($x, flip32Bytes($tx1))
	        ~mstore($x + 32, flip32Bytes($tx2))
	        flip32Bytes(sha256(sha256($x, chars=64)))


	macro m_shiftRight($val, $shift):
	    div($val, 2**$shift)

	macro m_shiftLeft($val, $shift):
	    $val * 2**$shift

	// bit length of '$val'
	macro m_bitLen($val):
	    with $length = 0:
	        with $int_type = $val:
	            while ($int_type):
	                $int_type = m_shiftRight($int_type, 1)
	                $length += 1
	        $length


	// reverse 32 bytes given by '$b32'
	macro flip32Bytes($b32):
	    with $a = $b32:  // important to force $a to only be examined once below
	        with $i = 0:
	            // unrolling this would decrease gas usage, but would increase
	            // the gas cost for code size by over 700K and exceed the PI million block gas limit
	            while $i < 32:
	                mstore8(ref($o) + $i, byte(31 - $i, $a))
	                $i += 1
	    $o


	// write $int64 to memory at $addrLoc
	// This is useful for writing 64bit ints inside one 32 byte word
	macro m_mwrite64($addrLoc, $int64):
	    with $addr = $addrLoc:
	        with $eightBytes = $int64:
	            mstore8($addr, byte(24, $eightBytes))
	            mstore8($addr + 1, byte(25, $eightBytes))
	            mstore8($addr + 2, byte(26, $eightBytes))
	            mstore8($addr + 3, byte(27, $eightBytes))
	            mstore8($addr + 4, byte(28, $eightBytes))
	            mstore8($addr + 5, byte(29, $eightBytes))
	            mstore8($addr + 6, byte(30, $eightBytes))
	            mstore8($addr + 7, byte(31, $eightBytes))


	// write $int128 to memory at $addrLoc
	// This is useful for writing 128bit ints inside one 32 byte word
	macro m_mwrite128($addrLoc, $int128):
	    with $addr = $addrLoc:
	        with $bytes16 = $int128:
	            mstore8($addr, byte(16, $bytes16))
	            mstore8($addr + 1, byte(17, $bytes16))
	            mstore8($addr + 2, byte(18, $bytes16))
	            mstore8($addr + 3, byte(19, $bytes16))
	            mstore8($addr + 4, byte(20, $bytes16))
	            mstore8($addr + 5, byte(21, $bytes16))
	            mstore8($addr + 6, byte(22, $bytes16))
	            mstore8($addr + 7, byte(23, $bytes16))
	            mstore8($addr + 8, byte(24, $bytes16))
	            mstore8($addr + 9, byte(25, $bytes16))
	            mstore8($addr + 10, byte(26, $bytes16))
	            mstore8($addr + 11, byte(27, $bytes16))
	            mstore8($addr + 12, byte(28, $bytes16))
	            mstore8($addr + 13, byte(29, $bytes16))
	            mstore8($addr + 14, byte(30, $bytes16))
	            mstore8($addr + 15, byte(31, $bytes16))



	//
	//  macro accessors for a block's _info (height, ibIndex, score)
	//

	// block height is the first 8 bytes of _info
	macro m_setHeight($blockHash, $blockHeight):
	    $word = sload(ref(self.block[$blockHash]._info))
	    m_mwrite64(ref($word), $blockHeight)
	    self.block[$blockHash]._info = $word

	macro m_getHeight($blockHash):
	    div(sload(ref(self.block[$blockHash]._info)), BYTES_24)


	// ibIndex is the index to self.internalBlock: it's the second 8 bytes of _info
	macro m_setIbIndex($blockHash, $internalIndex):
	    $word = sload(ref(self.block[$blockHash]._info))
	    m_mwrite64(ref($word) + 8, $internalIndex)
	    self.block[$blockHash]._info = $word

	macro m_getIbIndex($blockHash):
	    div(sload(ref(self.block[$blockHash]._info)) * BYTES_8, BYTES_24)


	// score of the block is the last 16 bytes of _info
	macro m_setScore($blockHash, $blockScore):
	    $word = sload(ref(self.block[$blockHash]._info))
	    m_mwrite128(ref($word) + 16, $blockScore)
	    self.block[$blockHash]._info = $word

	macro m_getScore($blockHash):
	    div(sload(ref(self.block[$blockHash]._info)) * BYTES_16, BYTES_16)


 */
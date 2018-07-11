const DogeClaimManager = artifacts.require('DogeClaimManager');
const DogeSuperblocks = artifacts.require('DogeSuperblocks');
const ScryptCheckerDummy = artifacts.require('ScryptCheckerDummy');
const ScryptVerifier = artifacts.require('ScryptVerifier');
const ScryptRunner = artifacts.require('ScryptRunner');
const ClaimManager = artifacts.require('ClaimManager');
const Web3 = require('web3');
const utils = require('./utils');

const toSession = (data) => ({
  lowStep: data[0],
  medStep: data[1],
  highStep: data[2],
  input: data[3],
  medHash: data[4],
});

const toResult = (data) => ({
  state: data[0],
  proof: data[1],
  stateHash: data[2],
});

const SUPERBLOCK_TIMES_DOGE_REGTEST = {
  DURATION: 600,    // 10 minute
  DELAY: 60,        // 1 minute
  TIMEOUT: 5,       // 5 seconds
  CONFIMATIONS: 1,  // Superblocks required to confirm semi approved superblock
};

const DOGE_MAINNET = 0;
const DOGE_TESTNET = 1;
const DOGE_REGTEST = 2;

contract('DogeClaimManager3', (accounts) => {
  const owner = accounts[0];
  const submitter = accounts[1];
  const challenger = accounts[2];
  let claimManager;
  let superblocks;
  let scryptChecker;
  let scryptVerifier;
  let scryptRunner;
  const initAccumulatedWork = 0;
  const initParentHash = '0x0000000000000000000000000000000000000000000000000000000000000000';

  let ClaimManagerEvents;

  async function initSuperblocks(dummyChecker, genesisSuperblock) {
    superblocks = await DogeSuperblocks.new();
    claimManager = await DogeClaimManager.new(DOGE_MAINNET, superblocks.address, SUPERBLOCK_TIMES_DOGE_REGTEST.DURATION, SUPERBLOCK_TIMES_DOGE_REGTEST.DELAY, SUPERBLOCK_TIMES_DOGE_REGTEST.TIMEOUT, SUPERBLOCK_TIMES_DOGE_REGTEST.CONFIMATIONS);
    scryptVerifier = await ScryptVerifier.new();
    if (dummyChecker) {
      scryptChecker = await ScryptCheckerDummy.new(false);
    } else {
      scryptChecker = await ClaimManager.new(scryptVerifier.address);
    }

    scryptRunner = await ScryptRunner.new();

    await superblocks.setClaimManager(claimManager.address);
    await claimManager.setScryptChecker(scryptChecker.address);
    await superblocks.initialize(
      genesisSuperblock.merkleRoot,
      genesisSuperblock.accumulatedWork,
      genesisSuperblock.timestamp,
      genesisSuperblock.lastHash,
      genesisSuperblock.parentId,
      { from: owner },
    );
    //FIXME: ganache-cli creates the same transaction hash if two account send the same amount
    await claimManager.makeDeposit({ value: 10, from: submitter });
    await claimManager.makeDeposit({ value: 11, from: challenger });
    ClaimManagerEvents = scryptChecker.allEvents();
  }
  describe('Confirm superblock after verification', () => {
    let superblock0;
    let superblock1;
    let superblock2;
    let claim1;
    let sessionId;
    let claimID;
    let plaintext;
    const blockHeader0 = `03016200ed1775274b69640ff5c197de7fb46222c516c913c0d4229c8b9ee75f48d44176f42a0cdc4b298be486f280afd46ee81af0656eaf604c84cda65be522c7b2d47a9eb958568a93051b0000000001000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4c034fa30d04a0b95856080360f87cfedf0300fabe6d6d4136bc0f5506042fd2bd9e7a6064438ae5a6c41070c91ab88f51f77f1393133f40000000000000000d2f6e6f64655374726174756d2f000000000100f90295000000001976a9145da2560b857f5ba7874de4a1173e67b4d509c46688ac0000000037af78fe582d969a976955e8ebdf132c137fd1e4fa4e1eb5bd65b8a28b4d9bae0000000000060000000000000000000000000000000000000000000000000000000000000000e2f61c3f71d1defd3fa999dfa36953755c690689799962b48bebd836974e8cf97d24db2bfa41474bfb2f877d688fac5faa5e10a2808cf9de307370b93352e54894857d3e08918f70395d9206410fbfa942f1a889aa5ab8188ec33c2f6e207dc7103fce20ded169912287c22ecbe0763e2dc5384c5f0df35badf49ea183b60b3649d27f8a11b46c6ba31c62ba3263888e8755c130367592e3a6d69d92b150073238000000030000001b78253b80f240a768a9d74b17bb9e98abd82df96dc42370d14a28a7e1c1bfe24a0e980080e4680e62deffe1bab1db7969d8b49fabcaddba795a1b704af2b25e14b9585651a3011be6741c81`;
    const blockHeader = `03016200519b073f01b8e21f9c85f641208532c4b0ea4b6fe1c073d785e98f36368db00230d12c3b1705c2d537dfb7e1bc7752552d90ed58a4de0472811abc7be48c18e5aeb95856bf7b051b0000000001000000010000000000000000000000000000000000000000000000000000000000000000ffffffff48034fa30dfabe6d6dceb3043181029fec3c58d430ccea0653138c0617ab51842024b7dc25877f63f1080000000000000004bab9585608081afdb79a2b0000092f7374726174756d2f000000000100f90295000000001976a91431bde7e496852dac06ff518e111a3adac6c6fba988ac00000000b114dabae52185d04b0b5bda1c12c9c8bd520cc7bad6d97b90a20b9eba9ab7d90000000000030000000000000000000000000000000000000000000000000000000000000000e2f61c3f71d1defd3fa999dfa36953755c690689799962b48bebd836974e8cf91521a64399d2cd5db1152d46dabe4781eadbb2ca7bfa59485b79d070a1c9181f00000000030000001b78253b80f240a768a9d74b17bb9e98abd82df96dc42370d14a28a7e1c1bfe2da78d7e7cad0b68c52a05291e777c2b7af5b092ccfde1ab34f21c1971924fc0220b9585651a3011bb52b416a`;
    const blockHash = utils.calcBlockSha256Hash(blockHeader);
    async function beginSuperblockChallenge() {
      let result;
      const genesisSuperblock = utils.makeSuperblock([blockHeader0], initParentHash, initAccumulatedWork);
      await initSuperblocks(false, genesisSuperblock);
      superblock0 = genesisSuperblock.superblockId;
      const best = await superblocks.getBestSuperblock();
      assert.equal(superblock0, best, 'Best superblock should match');

      const proposedSuperblock = utils.makeSuperblock([blockHeader], genesisSuperblock.superblockId, genesisSuperblock.accumulatedWork);

      result = await claimManager.proposeSuperblock(
        proposedSuperblock.merkleRoot,
        proposedSuperblock.accumulatedWork,
        proposedSuperblock.timestamp,
        proposedSuperblock.lastHash,
        proposedSuperblock.parentId,
        { from: submitter },
      );
      assert.equal(result.logs[1].event, 'SuperblockClaimCreated', 'New superblock proposed');
      superblock1 = result.logs[1].args.superblockId;
      claim1 = superblock1;

      result = await claimManager.challengeSuperblock(superblock1, { from: challenger });
      assert.equal(result.logs[1].event, 'SuperblockClaimChallenged', 'Superblock challenged');
      assert.equal(claim1, result.logs[1].args.claimId);

      result = await claimManager.runNextBattleSession(claim1, { from: challenger });
      assert.equal(result.logs[0].event, 'NewBattle', 'New battle session');
      session1 = result.logs[0].args.sessionId;
      assert.equal(result.logs[1].event, 'VerificationGameStarted', 'Battle started');
      result = await claimManager.queryMerkleRootHashes(session1, { from: challenger });
      assert.equal(result.logs[0].event, 'QueryMerkleRootHashes', 'Query merkle root hashes');
      result = await claimManager.respondMerkleRootHashes(session1, [blockHash], { from: submitter });
      assert.equal(result.logs[0].event, 'RespondMerkleRootHashes', 'Respond merkle root hashes');

      result = await claimManager.queryBlockHeader(session1, blockHash, { from: challenger });
      assert.equal(result.logs[0].event, 'QueryBlockHeader', 'Query block header');
      const scryptHash = `0x${utils.calcHeaderPoW(blockHeader)}`;
      result = await claimManager.respondBlockHeader(session1, scryptHash, `0x${blockHeader}`, { from: submitter });
      assert.equal(result.logs[0].event, 'RespondBlockHeader', 'Respond block header');
      const claimCreated = ClaimManagerEvents.formatter(result.receipt.logs[0]);
      claimID = claimCreated.args.claimID;
      plaintext = claimCreated.args.plaintext;
    }
    beforeEach(async () => {
      await beginSuperblockChallenge();
    });
    it('Confirm valid block scrypt hash', async () => {
      let result;
      let session;
      let step;
      let computeStep;
      // Make a challenge
      result = await scryptChecker.challengeClaim(claimID, { from: challenger });
      assert.equal(result.logs[0].event, 'ClaimChallenged', 'Make challenge to scrypt hash');
      result = await scryptChecker.runNextVerificationGame(claimID, { from: challenger });
      assert.equal(result.logs[0].event, 'VerificationGameStarted', 'Start challenge scrypt hash game');

      sessionId = await scryptChecker.getSession.call(claimID, challenger);

      // Start session
      session = toSession(await scryptVerifier.getSession.call(sessionId));
      assert.equal(session.lowStep.toNumber(), 0);
      assert.equal(session.medStep.toNumber(), 0);
      assert.equal(session.highStep.toNumber(), 2049);
      assert.equal(session.medHash, '0x0000000000000000000000000000000000000000000000000000000000000000');

      // Steps are hardcoded because ganache is too slow to calculate them
      step = 1030;
      result = await scryptVerifier.query(sessionId, step, { from: challenger });

      session = toSession(await scryptVerifier.getSession.call(sessionId));
      assert.equal(session.lowStep.toNumber(), 0);
      assert.equal(session.medStep.toNumber(), 1030);
      assert.equal(session.highStep.toNumber(), 2049);
      assert.equal(session.medHash, '0x0000000000000000000000000000000000000000000000000000000000000000');

      // A step can be calculated calling getStateProofAndHash from ScryptRunner
      //result = await scryptRunner.getStateProofAndHash.call(plaintext, step);
      //computeStep = toResult(result);
      computeStep1030 = computeStep = {
        state: "0xd67a648119be37acddcafdc07c191fff94cda065bceae2d7d95e8d82633f1cd3486a34344d327122c2577c6e6469b555a93e3b9181b235945b8f225f0ffde33effc732e315a3d03650993b6b904c02fdbdb54c57b26c7ef9440f45b5d54ad1c4f67c954b740ac7a772a9254d98a5b87d573e98a598cd89f83008fb142ffd2292e0223421711df57c3e47692b39e9a05f365cfec556386253dc77daf86628f1d6425dee66456c88063b94fb1d91a753a51ce4ee98d1bdc0035322350462ddda0d",
        proof: "0xc4b087e75ac60ff8d6974263ec7899d94b39085bcdd5236f8ddcd9e963478be2e6e6c0e734d1f0a22e6bbb6d4be83c04627b05d2622b45d20c586cb41c83bcec5ec03e727d5dabc7f4e6e8c1a10eced3f143dd6286b78da5b882382da380279f35965becc5f63b5c190c7b6ee270fac05372ec51a9749ef4a66f76a2943e7813cb803825a8e324a5a03b1d255e97f74a4f369346503b1b06da037909de9130a62853f5e81499d3c6648b5f907640f2c1d3548a944fd604b7f2a067e375ed1dce03dab6eb852513b5559d51c3da1e74d1792d3dbc6661672a2b707cee744dc6424ff5ed61afed5d7fdbf2bf24ef5fa3a7549abc4ec14094e7a43feaedd03fcdba1836de7e1020cb68339efefa35e034219340baf02d274d2c693f6eb810f44d12a4480e221f98ad1442aae81262e9847a5c02262d5645139a417f1da5e0f15179876f5b19a07f3a25b3736f598898b543690937146063c2dffaf0becde9308a0c44ab196f0fd24d9fc12c9bff1d0cdbda217b137586e77c1c6de131f235f93cc68ad3281b66c3c11f15e65edb937d7601a56c61ddf2810998f80bbf0796734453256037543340cee021f6c549e0e1ce4246e6d5100a7c132a3634e957859b6c9f",
        stateHash: "0x84984aedd2cb8489c5c2f82770ebc86e8468bcc6d8b1b0e9fbfd81458b13154d",
      };
      result = await scryptVerifier.respond(sessionId, step, computeStep.stateHash, { from: submitter });

      session = toSession(await scryptVerifier.getSession.call(sessionId));
      assert.equal(session.lowStep.toNumber(), 0);
      assert.equal(session.medStep.toNumber(), 1030);
      assert.equal(session.highStep.toNumber(), 2049);
      assert.equal(session.medHash, computeStep1030.stateHash);

      step = 1031;
      result = await scryptVerifier.query(sessionId, step, { from: challenger });

      session = toSession(await scryptVerifier.getSession.call(sessionId));
      assert.equal(session.lowStep.toNumber(), 1030);
      assert.equal(session.medStep.toNumber(), 1031);
      assert.equal(session.highStep.toNumber(), 2049);
      assert.equal(session.medHash, '0x0000000000000000000000000000000000000000000000000000000000000000');

      //result = await scryptRunner.getStateProofAndHash.call(plaintext, step);
      //computeStep = toResult(result);
      computeStep1031 = computeStep = {
        state: "0x57ad9479f7975496daa567db9f52781bab1082dbbc0f90d21eaac0521b4e6bb3dd2f9f434f4f92cd489488011ac4f3aa4d942a02bd8f1e8ff7ec7c15d8f92389a1829b6b93331dfafd50de97a4189473e6d4224612fc695a166c97835edd41229ff2ac12a3c7b9d4e875ff0a20e222c03bc704d90e8c8041ac7bd59be1652fe7e0223421711df57c3e47692b39e9a05f365cfec556386253dc77daf86628f1d6425dee66456c88063b94fb1d91a753a51ce4ee98d1bdc0035322350462ddda0d",
        proof: "0x52ab62e20055bf1126eab0741f545a5dcbbbca6282d2ffdb1ba9120b5753af5d5f852517b17ea2f11714ad9f1a19dc087c7a16390d75443388bd8af5c4ee2f061fa30a6b243063657da5c3ff5275bca8e1c448f576ab97ae309bbc3a0c9a98e956fb8e8a26c6bc86ccce55e87ef088878a8359e545976c79e7c5791c038ed92146e0ff2c9fe72624081b77bd6658cff7a640d89b6cc314a1070949ad390ab6091b80c73daff8c9339ba86cc00ca1ba568d646def9ea2776fe319010e1cc32c6077cdd40369b4993a851bb7905884803b0e55d92521cf1aa15dea102600e6180c262b69a0ec68aa05e808da6b0c661668c9f28957a6e5d3e33635f40c69dc2d2764ee00aa6f167d86946070649d653e0769951ca52c520a957c353dc7a518cf7e267ffe293b6e4692ace9d009cba7bd6de199e600c117ab4e6a7e405d4b49577fde3f0aed6db5b4a889b02d21d79c6189441efceb56668ed76268a0fc4dc0c80e1858d2cda77da52ebbd11904c9186f67b4402ca21fb4f950e0428de9f1c020f3515d18d3b17f81f13eac6fb0176e44d9046e3c91261c830915286518f5cb70f4ba22cb2aae0a1e1d1f3c8ae32a0603262532401358a56b4810b54cc15cc7cff5",
        stateHash: "0xc1ac3aa2639fdac2aa9943a51178d42b924680887dc4a700e5661a269f2ab7f2",
      };
      result = await scryptVerifier.respond(sessionId, step, computeStep.stateHash, { from: submitter });

      session = toSession(await scryptVerifier.getSession.call(sessionId));
      assert.equal(session.lowStep.toNumber(), 1030);
      assert.equal(session.medStep.toNumber(), 1031);
      assert.equal(session.highStep.toNumber(), 2049);
      assert.equal(session.medHash, computeStep1031.stateHash);

      // To finish we need to set session.lowStep + 1 == session.highStep
      step = 1030;
      result = await scryptVerifier.query(sessionId, step, { from: challenger });

      session = toSession(await scryptVerifier.getSession.call(sessionId));
      assert.equal(session.lowStep.toNumber(), 1030);
      assert.equal(session.medStep.toNumber(), 1031);
      assert.equal(session.highStep.toNumber(), 1031);
      assert.equal(session.medHash, computeStep1031.stateHash);

      // Final step can be executed by either submitter or challenger
      result = await scryptVerifier.performStepVerification(
        sessionId,
        claimID,
        computeStep1030.state,
        computeStep1031.state,
        computeStep1031.proof,
        scryptChecker.address,
        { from: submitter }
      );
      assert.equal(result.logs[0].event, 'ChallengerConvicted', 'Challenger convicted');

      result = await scryptChecker.checkClaimSuccessful(claimID, { from: submitter });
      assert.equal(result.logs[0].event, 'ClaimSuccessful', 'Scrypt hash verified');

      // Verify superblock
      result = await claimManager.verifySuperblock(session1, { from: submitter });
      assert.equal(result.logs[0].event, 'SuperblockBattleDecided', 'Superblock verified');
      assert.equal(result.logs[1].event, 'ChallengerConvicted', 'Challenger failed');

      // Confirm superblock
      await utils.timeoutSeconds(3*SUPERBLOCK_TIMES_DOGE_REGTEST.TIMEOUT);
      result = await claimManager.checkClaimFinished(superblock1, { from: submitter });
      assert.equal(result.logs[0].event, 'SuperblockClaimPending', 'Superblock challenged');
    });
    it('Reject invalid block scrypt hash', async () => {
      let result;
      let session;
      let step;
      let computeStep;
      // Make a challenge
      result = await scryptChecker.challengeClaim(claimID, { from: challenger });
      assert.equal(result.logs[0].event, 'ClaimChallenged', 'Make challenge to scrypt hash');
      result = await scryptChecker.runNextVerificationGame(claimID, { from: challenger });
      assert.equal(result.logs[0].event, 'VerificationGameStarted', 'Start challenge scrypt hash game');

      sessionId = await scryptChecker.getSession.call(claimID, challenger);

      // Start session
      session = toSession(await scryptVerifier.getSession.call(sessionId));
      assert.equal(session.lowStep.toNumber(), 0);
      assert.equal(session.medStep.toNumber(), 0);
      assert.equal(session.highStep.toNumber(), 2049);
      assert.equal(session.medHash, '0x0000000000000000000000000000000000000000000000000000000000000000');

      // Steps are hardcoded because ganache is too slow to calculate them
      step = 1030;
      result = await scryptVerifier.query(sessionId, step, { from: challenger });

      session = toSession(await scryptVerifier.getSession.call(sessionId));
      assert.equal(session.lowStep.toNumber(), 0);
      assert.equal(session.medStep.toNumber(), 1030);
      assert.equal(session.highStep.toNumber(), 2049);
      assert.equal(session.medHash, '0x0000000000000000000000000000000000000000000000000000000000000000');

      // A step can be calculated calling getStateProofAndHash from ScryptRunner
      //result = await scryptRunner.getStateProofAndHash.call(plaintext, step);
      //computeStep = toResult(result);
      computeStep1030 = computeStep = {
        state: "0xd67a648119be37acddcafdc07c191fff94cda065bceae2d7d95e8d82633f1cd3486a34344d327122c2577c6e6469b555a93e3b9181b235945b8f225f0ffde33effc732e315a3d03650993b6b904c02fdbdb54c57b26c7ef9440f45b5d54ad1c4f67c954b740ac7a772a9254d98a5b87d573e98a598cd89f83008fb142ffd2292e0223421711df57c3e47692b39e9a05f365cfec556386253dc77daf86628f1d6425dee66456c88063b94fb1d91a753a51ce4ee98d1bdc0035322350462ddda0d",
        proof: "0xc4b087e75ac60ff8d6974263ec7899d94b39085bcdd5236f8ddcd9e963478be2e6e6c0e734d1f0a22e6bbb6d4be83c04627b05d2622b45d20c586cb41c83bcec5ec03e727d5dabc7f4e6e8c1a10eced3f143dd6286b78da5b882382da380279f35965becc5f63b5c190c7b6ee270fac05372ec51a9749ef4a66f76a2943e7813cb803825a8e324a5a03b1d255e97f74a4f369346503b1b06da037909de9130a62853f5e81499d3c6648b5f907640f2c1d3548a944fd604b7f2a067e375ed1dce03dab6eb852513b5559d51c3da1e74d1792d3dbc6661672a2b707cee744dc6424ff5ed61afed5d7fdbf2bf24ef5fa3a7549abc4ec14094e7a43feaedd03fcdba1836de7e1020cb68339efefa35e034219340baf02d274d2c693f6eb810f44d12a4480e221f98ad1442aae81262e9847a5c02262d5645139a417f1da5e0f15179876f5b19a07f3a25b3736f598898b543690937146063c2dffaf0becde9308a0c44ab196f0fd24d9fc12c9bff1d0cdbda217b137586e77c1c6de131f235f93cc68ad3281b66c3c11f15e65edb937d7601a56c61ddf2810998f80bbf0796734453256037543340cee021f6c549e0e1ce4246e6d5100a7c132a3634e957859b6c9f",
        stateHash: "0x84984aedd2cb8489c5c2f82770ebc86e8468bcc6d8b1b0e9fbfd81458b13154d",
      };
      result = await scryptVerifier.respond(sessionId, step, computeStep.stateHash, { from: submitter });

      session = toSession(await scryptVerifier.getSession.call(sessionId));
      assert.equal(session.lowStep.toNumber(), 0);
      assert.equal(session.medStep.toNumber(), 1030);
      assert.equal(session.highStep.toNumber(), 2049);
      assert.equal(session.medHash, computeStep1030.stateHash);

      step = 1031;
      result = await scryptVerifier.query(sessionId, step, { from: challenger });

      session = toSession(await scryptVerifier.getSession.call(sessionId));
      assert.equal(session.lowStep.toNumber(), 1030);
      assert.equal(session.medStep.toNumber(), 1031);
      assert.equal(session.highStep.toNumber(), 2049);
      assert.equal(session.medHash, '0x0000000000000000000000000000000000000000000000000000000000000000');

      result = await scryptVerifier.respond(sessionId, step, computeStep.stateHash, { from: submitter });

      session = toSession(await scryptVerifier.getSession.call(sessionId));
      assert.equal(session.lowStep.toNumber(), 1030);
      assert.equal(session.medStep.toNumber(), 1031);
      assert.equal(session.highStep.toNumber(), 2049);
      assert.equal(session.medHash, computeStep1030.stateHash);

      // To finish we need to set session.lowStep + 1 == session.highStep
      step = 1030;
      result = await scryptVerifier.query(sessionId, step, { from: challenger });

      session = toSession(await scryptVerifier.getSession.call(sessionId));
      assert.equal(session.lowStep.toNumber(), 1030);
      assert.equal(session.medStep.toNumber(), 1031);
      assert.equal(session.highStep.toNumber(), 1031);
      assert.equal(session.medHash, computeStep1030.stateHash);

      // Final step can be executed by either submitter or challenger
      result = await scryptVerifier.performStepVerification(
        sessionId,
        claimID,
        computeStep1030.state,
        computeStep1030.state,
        computeStep1030.proof,
        scryptChecker.address,
        { from: challenger }
      );
      assert.equal(result.logs[0].event, 'ClaimantConvicted', 'Claimant convicted');

      // Reject scrypt hash
      await utils.timeoutSeconds(3*SUPERBLOCK_TIMES_DOGE_REGTEST.TIMEOUT);
      result = await scryptChecker.checkClaimSuccessful(claimID, { from: challenger });
      assert.equal(result.logs[0].event, 'ClaimFailed', 'Scrypt hash failed');

      // Verify superblock
      result = await claimManager.verifySuperblock(session1, { from: challenger });
      assert.equal(result.logs[0].event, 'SuperblockBattleDecided', 'Superblock failed');
      assert.equal(result.logs[1].event, 'SubmitterConvicted', 'Superblock failed');

      // Confirm superblock
      await utils.timeoutSeconds(3*SUPERBLOCK_TIMES_DOGE_REGTEST.TIMEOUT);
      result = await claimManager.checkClaimFinished(superblock1, { from: challenger });
      assert.equal(result.logs[0].event, 'SuperblockClaimFailed', 'Superblock failed');
    });
  });
});

// 140 = 128 + 12 = 16*8 + 12 = 0x8c
const fs = require('fs');
const utils = require('./utils');
const DogeSuperblocks = artifacts.require('DogeSuperblocks');
const DogeClaimManager = artifacts.require('DogeClaimManager');

let superblock1MerkleRoot = "0xdb7aea0bb3c1c5eef58997bf75de93173fb914b807b85df50671790627471e99";
let superblock1ChainWork = "0x7c";
let superblock1LastDogeBlockTime = 1522097078;
let superblock1LastDogeBlockHash = "0x1ff78c993a7de8bf6c5e3f4a81c715adde8220ea8dcca51e01ba706943303c53";
let superblock1ParentId = "0x381be106bf5ac501957c128936ada535c863dcdb1f34180346979650df9f3e76";
let superblock1Id = "0x398606391a81540afb940578239699ebfb94383f7655c707b28ff7d9d57790e7";

let superblock2MerkleRoot = "0xcbe42b875399f4267cd4fa46dcfbb496062b77930bbd027c6de462e982a16dc5";
let superblock2ChainWork = "0x8e";
let superblock2LastDogeBlockTime = 1522179197;
let superblock2LastDogeBlockHash = "0xcbe42b875399f4267cd4fa46dcfbb496062b77930bbd027c6de462e982a16dc5";
let superblock2ParentId = superblock1Id;
let superblock2Id = "0x249c091977946772e31f32f52c62ef0c72b985b6b87fb726ddd36b17fc5a0a0d";

let superblock3MerkleRoot = "0x49c9fee33f814e654979094f3694ebe109993c2f999b5141d425af28f93893f0";
let superblock3ChainWork = "0x90";
let superblock3LastDogeBlockTime = 1524766665;
let superblock3LastDogeBlockHash = "0x49c9fee33f814e654979094f3694ebe109993c2f999b5141d425af28f93893f0";
let superblock3ParentId = superblock2Id;
let superblock3Id = "0xd2a92b0e691fddd3413d4c07e548b629a5655572a27337c0994728969ba1e086";

contract('DogeSuperblocks', (accounts) => {
    describe.only('Superblock proposal integration test', function() {
        let dogeSuperblocks;
        let claimManager;
        
        let dogeSuperblocksJSON = fs.readFileSync('./build/contracts/DogeSuperblocks.json', 'utf8');
        let dogeSuperblocksParsedJSON = JSON.parse(dogeSuperblocksJSON);
        let networks = dogeSuperblocksParsedJSON['networks'];
        let networkKey = Object.keys(networks)[0];
        let dogeSuperblocksAddress = networks[networkKey].address;
        
        // let dogeClaimManagerJSON = fs.readFileSync('./build/contracts/DogeClaimManager.json', 'utf8');
        // let dogeClaimManagerParsedJSON = JSON.parse(dogeClaimManagerJSON);
        // networks = dogeClaimManagerParsedJSON['networks'];
        // let claimManagerAddress = networks[networkKey].address;
        let claimManagerAddress;
        
        before(async() => {
            dogeSuperblocks = await DogeSuperblocks.at(dogeSuperblocksAddress);
            claimManagerAddress = await dogeSuperblocks.claimManager.call();
            claimManager = await DogeClaimManager.at(claimManagerAddress);
            
            // console.log(dogeSuperblocksAddress, claimManagerAddress);
            // await dogeSuperblocks.setClaimManager(claimManagerAddress);
        });
    
        let merkleRoot;
        let chainWork;
        let lastDogeBlockTime;
        let lastDogeBlockHash;
        let parentId;
        let superblockId;

        let bestSuperblock;
        let dogeSuperblocksClaimManager;
    
        it('Superblock 1', async() => {
            dogeSuperblocksClaimManager = await dogeSuperblocks.claimManager;
            
            await utils.mineBlocks(web3, 5);
            await claimManager.checkClaimFinished(superblock1Id);
            await utils.mineBlocks(web3, 5);
            
            merkleRoot = await dogeSuperblocks.getSuperblockMerkleRoot(superblock1Id);
            chainWork = await dogeSuperblocks.getSuperblockAccumulatedWork(superblock1Id);
            lastDogeBlockTime = await dogeSuperblocks.getSuperblockTimestamp(superblock1Id);
            lastDogeBlockHash = await dogeSuperblocks.getSuperblockLastHash(superblock1Id);
            parentId = await dogeSuperblocks.getSuperblockParentId(superblock1Id);
            
            assert.equal(merkleRoot, superblock1MerkleRoot, "Superblock 1 Merkle root does not match");
            assert.equal(chainWork.toNumber(), superblock1ChainWork, "Superblock 1 chain work does not match");
            assert.equal(lastDogeBlockTime, superblock1LastDogeBlockTime, "Superblock 1 last Doge block time does not match");
            assert.equal(lastDogeBlockHash, superblock1LastDogeBlockHash, "Superblock 1 last Doge block hash does not match");
            assert.equal(parentId, superblock1ParentId, "Superblock 1 parent ID does not match");
        });
        
        // it('Superblock 2', async() => {
        //     dogeSuperblocksClaimManager = await dogeSuperblocks.claimManager;
            
        //     await utils.mineBlocks(web3, 5);
        //     await claimManager.checkClaimFinished(superblock2Id);
        //     await utils.mineBlocks(web3, 5);
            
        //     merkleRoot = await dogeSuperblocks.getSuperblockMerkleRoot(superblock2Id);
        //     chainWork = await dogeSuperblocks.getSuperblockAccumulatedWork(superblock2Id);
        //     lastDogeBlockTime = await dogeSuperblocks.getSuperblockTimestamp(superblock2Id);
        //     lastDogeBlockHash = await dogeSuperblocks.getSuperblockLastHash(superblock2Id);
        //     parentId = await dogeSuperblocks.getSuperblockParentId(superblock2Id);
            
        //     assert.equal(merkleRoot, superblock2MerkleRoot, "Superblock 2 Merkle root does not match");
        //     assert.equal(chainWork.toNumber(), superblock2ChainWork, "Superblock 2 chain work does not match");
        //     assert.equal(lastDogeBlockTime, superblock2LastDogeBlockTime, "Superblock 2 last Doge block time does not match");
        //     assert.equal(lastDogeBlockHash, superblock2LastDogeBlockHash, "Superblock 2 last Doge block hash does not match");
        //     assert.equal(parentId, superblock2ParentId, "Superblock 2 parent ID does not match");
        // });

        // it('Superblock 3', async() => {
        //     dogeSuperblocksClaimManager = await dogeSuperblocks.claimManager;
            
        //     await utils.mineBlocks(web3, 5);
        //     await claimManager.checkClaimFinished(superblock3Id);
        //     await utils.mineBlocks(web3, 5);
            
        //     merkleRoot = await dogeSuperblocks.getSuperblockMerkleRoot(superblock3Id);
        //     chainWork = await dogeSuperblocks.getSuperblockAccumulatedWork(superblock3Id);
        //     lastDogeBlockTime = await dogeSuperblocks.getSuperblockTimestamp(superblock3Id);
        //     lastDogeBlockHash = await dogeSuperblocks.getSuperblockLastHash(superblock3Id);
        //     parentId = await dogeSuperblocks.getSuperblockParentId(superblock3Id);
            
        //     assert.equal(merkleRoot, superblock3MerkleRoot, "Superblock 3 Merkle root does not match");
        //     assert.equal(chainWork.toNumber(), superblock3ChainWork, "Superblock 3 chain work does not match");
        //     assert.equal(lastDogeBlockTime, superblock3LastDogeBlockTime, "Superblock 3 last Doge block time does not match");
        //     assert.equal(lastDogeBlockHash, superblock3LastDogeBlockHash, "Superblock 3 last Doge block hash does not match");
        //     assert.equal(parentId, superblock3ParentId, "Superblock 3 parent ID does not match");
        // });

        before(async() => {
            bestSuperblock = await dogeSuperblocks.getBestSuperblock();
            console.log("Best superblock:", bestSuperblock);
        });

    });
});
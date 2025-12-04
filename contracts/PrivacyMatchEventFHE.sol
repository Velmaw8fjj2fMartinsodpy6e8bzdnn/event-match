// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PrivacyMatchEventFHE is SepoliaConfig {
    struct EncryptedProfile {
        uint256 id;
        euint32 encryptedPreferences;
        euint32 encryptedPersonalInfo;
        uint256 timestamp;
    }

    struct DecryptedMatch {
        uint256 participantA;
        uint256 participantB;
        bool isRevealed;
    }

    uint256 public profileCount;
    mapping(uint256 => EncryptedProfile) public encryptedProfiles;
    mapping(uint256 => DecryptedMatch) public matchResults;

    mapping(uint256 => uint256) private requestToProfileId;

    event ProfileSubmitted(uint256 indexed id, uint256 timestamp);
    event MatchRequested(uint256 indexed requestId);
    event MatchDecrypted(uint256 indexed profileId);

    modifier onlyParticipant(uint256 profileId) {
        _;
    }

    function submitEncryptedProfile(
        euint32 encryptedPreferences,
        euint32 encryptedPersonalInfo
    ) public {
        profileCount += 1;
        uint256 newId = profileCount;

        encryptedProfiles[newId] = EncryptedProfile({
            id: newId,
            encryptedPreferences: encryptedPreferences,
            encryptedPersonalInfo: encryptedPersonalInfo,
            timestamp: block.timestamp
        });

        emit ProfileSubmitted(newId, block.timestamp);
    }

    function requestMatch(uint256 profileIdA, uint256 profileIdB) public onlyParticipant(profileIdA) {
        EncryptedProfile storage profileA = encryptedProfiles[profileIdA];
        EncryptedProfile storage profileB = encryptedProfiles[profileIdB];

        bytes32[] memory ciphertexts = new bytes32[](4);
        ciphertexts[0] = FHE.toBytes32(profileA.encryptedPreferences);
        ciphertexts[1] = FHE.toBytes32(profileA.encryptedPersonalInfo);
        ciphertexts[2] = FHE.toBytes32(profileB.encryptedPreferences);
        ciphertexts[3] = FHE.toBytes32(profileB.encryptedPersonalInfo);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptMatch.selector);
        requestToProfileId[reqId] = profileIdA;

        emit MatchRequested(reqId);
    }

    function decryptMatch(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 profileIdA = requestToProfileId[requestId];
        require(profileIdA != 0, "Invalid request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint256[] memory results = abi.decode(cleartexts, (uint256[]));
        matchResults[profileIdA] = DecryptedMatch({
            participantA: profileIdA,
            participantB: results[0],
            isRevealed: true
        });

        emit MatchDecrypted(profileIdA);
    }

    function getMatch(uint256 profileId) public view returns (uint256 participantA, uint256 participantB, bool isRevealed) {
        DecryptedMatch storage m = matchResults[profileId];
        return (m.participantA, m.participantB, m.isRevealed);
    }

    function batchRequestMatches(uint256[] memory profileIds) public {
        for (uint i = 0; i < profileIds.length; i+=2) {
            if (i+1 < profileIds.length) {
                requestMatch(profileIds[i], profileIds[i+1]);
            }
        }
    }

    function getEncryptedProfile(uint256 profileId) public view returns (euint32 encryptedPreferences, euint32 encryptedPersonalInfo) {
        EncryptedProfile storage p = encryptedProfiles[profileId];
        return (p.encryptedPreferences, p.encryptedPersonalInfo);
    }
}
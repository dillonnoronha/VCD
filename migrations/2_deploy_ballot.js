const Ballot = artifacts.require("Ballot");

module.exports = async function (deployer) {
  const proposalNames = [
    web3.utils.asciiToHex("Alice"),
    web3.utils.asciiToHex("Bob"),
    web3.utils.asciiToHex("Charlie"),
  ];

  await deployer.deploy(Ballot, proposalNames);
};

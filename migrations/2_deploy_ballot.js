const Ballot = artifacts.require("Ballot");

module.exports = async function (deployer) {
  const proposals = ["Red", "Blue", "Green"].map(p =>
    web3.utils.asciiToHex(p)
  );

  await deployer.deploy(Ballot, proposals);
};

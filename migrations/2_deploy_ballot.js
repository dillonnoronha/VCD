const Ballot = artifacts.require("Ballot");

module.exports = async function (deployer) {
  const proposals = ["Red", "Blue", "Green"].map(p =>
    web3.utils.asciiToHex(p)
  );

  const duration = 300;

  await deployer.deploy(Ballot, proposals, duration);
};

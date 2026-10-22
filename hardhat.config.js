require("@nomicfoundation/hardhat-toolbox");
const { PRIVATE_KEY, RPC_URL } = process.env;
module.exports = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: {
    localhost: { url: "http://127.0.0.1:8545" },
    ...(RPC_URL && PRIVATE_KEY ? { testnet: { url: RPC_URL, accounts: [PRIVATE_KEY] } } : {}),
  },
};

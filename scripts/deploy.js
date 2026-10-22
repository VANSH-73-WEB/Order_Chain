const fs = require("fs");
const { ethers } = require("hardhat");
async function main() {
  const T = await ethers.getContractFactory("MockToken");
  const base = await T.deploy("Wrapped ETH", "WETH"); const quote = await T.deploy("USD Coin", "USDC");
  const ob = await (await ethers.getContractFactory("OrderBook")).deploy(base.target, quote.target);
  await Promise.all([base.waitForDeployment(), quote.waitForDeployment(), ob.waitForDeployment()]);
  const { chainId } = await ethers.provider.getNetwork();
  const cfg = { chainId: Number(chainId), orderBook: ob.target, base: base.target, quote: quote.target };
  fs.writeFileSync("frontend/config.js", "window.CONFIG = " + JSON.stringify(cfg, null, 2) + ";\n");
  console.log("Deployed:", cfg, "\nAddresses written to frontend/config.js");
}
main().catch((e) => { console.error(e); process.exit(1); });

// Seeds the deployed book with liquidity and a crossing trade so the UI has something to show.
const { ethers } = require("hardhat");
const cfg = JSON.parse(require("fs").readFileSync("frontend/config.js", "utf8").replace("window.CONFIG = ", "").replace(/;\s*$/, ""));
const e = (n) => ethers.parseEther(String(n));
async function main() {
  const [, mm, taker] = await ethers.getSigners();
  const base = await ethers.getContractAt("MockToken", cfg.base);
  const quote = await ethers.getContractAt("MockToken", cfg.quote);
  const ob = await ethers.getContractAt("OrderBook", cfg.orderBook);
  for (const s of [mm, taker]) {
    await (await base.mint(s.address, e(50))).wait(); await (await quote.mint(s.address, e(100000))).wait();
    await (await base.connect(s).approve(ob.target, ethers.MaxUint256)).wait();
    await (await quote.connect(s).approve(ob.target, ethers.MaxUint256)).wait();
    await (await ob.connect(s).deposit(true, e(50))).wait(); await (await ob.connect(s).deposit(false, e(100000))).wait();
  }
  for (let i = 1; i <= 5; i++) {
    await (await ob.connect(mm).placeLimitOrder(true, e(2000 - i * 10), e(1 + i / 10))).wait();
    await (await ob.connect(mm).placeLimitOrder(false, e(2000 + i * 10), e(1 + i / 10))).wait();
  }
  await (await ob.connect(taker).placeLimitOrder(true, e(2025), e(1.3))).wait();
  console.log("Demo liquidity + a crossing trade placed.");
}
main().catch((e) => { console.error(e); process.exit(1); });

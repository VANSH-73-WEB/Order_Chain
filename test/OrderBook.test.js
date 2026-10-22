const { expect } = require("chai");
const { ethers } = require("hardhat");
const e = (n) => ethers.parseEther(String(n));

describe("OrderBook", () => {
  let ob, base, quote, alice, bob;
  beforeEach(async () => {
    [, alice, bob] = await ethers.getSigners();
    const T = await ethers.getContractFactory("MockToken");
    base = await T.deploy("Wrapped ETH", "WETH"); quote = await T.deploy("USD Coin", "USDC");
    ob = await (await ethers.getContractFactory("OrderBook")).deploy(base.target, quote.target);
    for (const s of [alice, bob]) {
      await base.mint(s.address, e(100)); await quote.mint(s.address, e(100000));
      await base.connect(s).approve(ob.target, ethers.MaxUint256);
      await quote.connect(s).approve(ob.target, ethers.MaxUint256);
      await ob.connect(s).deposit(true, e(100)); await ob.connect(s).deposit(false, e(100000));
    }
  });

  it("rests non-crossing orders sorted by price", async () => {
    await ob.connect(alice).placeLimitOrder(true, e(1900), e(1));
    await ob.connect(alice).placeLimitOrder(true, e(1950), e(1));
    await ob.connect(bob).placeLimitOrder(false, e(2100), e(1));
    const [bids, asks] = await ob.getBook(10);
    expect(bids.map((b) => b.price)).to.deep.equal([e(1950), e(1900)]);
    expect(asks.length).to.equal(1);
  });

  it("matches at the maker price and refunds price improvement", async () => {
    await ob.connect(alice).placeLimitOrder(false, e(2000), e(2));
    await ob.connect(bob).placeLimitOrder(true, e(2100), e(1));
    expect(await ob.baseBalance(bob.address)).to.equal(e(101));
    expect(await ob.quoteBalance(bob.address)).to.equal(e(100000 - 2000));
    expect(await ob.quoteBalance(alice.address)).to.equal(e(102000));
    const [, asks] = await ob.getBook(10);
    expect(asks[0].amount).to.equal(e(1));
  });

  it("enforces time priority at equal price", async () => {
    await ob.connect(alice).placeLimitOrder(false, e(2000), e(1));
    await ob.connect(bob).placeLimitOrder(false, e(2000), e(1));
    await ob.connect(bob).placeLimitOrder(true, e(2000), e(1));
    expect(await ob.quoteBalance(alice.address)).to.equal(e(102000));
  });

  it("partially fills and rests remainder", async () => {
    await ob.connect(alice).placeLimitOrder(false, e(2000), e(1));
    await ob.connect(bob).placeLimitOrder(true, e(2000), e(3));
    const [bids, asks] = await ob.getBook(10);
    expect(asks.length).to.equal(0);
    expect(bids[0].amount).to.equal(e(2));
  });

  it("cancels and refunds locked funds", async () => {
    await ob.connect(alice).placeLimitOrder(true, e(1900), e(2));
    expect(await ob.quoteBalance(alice.address)).to.equal(e(100000 - 3800));
    await ob.connect(alice).cancelOrder(1);
    expect(await ob.quoteBalance(alice.address)).to.equal(e(100000));
    await expect(ob.connect(bob).cancelOrder(1)).to.be.reverted;
  });

  it("rejects orders without funds and bad lots", async () => {
    await expect(ob.connect(alice).placeLimitOrder(true, e(2000), e(1000))).to.be.reverted;
    await expect(ob.connect(alice).placeLimitOrder(true, 1, e(1))).to.be.revertedWith("bad price");
  });
});

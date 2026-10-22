# OrderChain - a fully onchain limit order book

**Hack in Hills 26 - Track 02: Onchain Finance & Trading**

## The idea
Most "decentralised" exchanges still depend on an offchain matching engine or relayer. OrderChain
removes it: order storage, **price-time priority matching and settlement all run inside one smart
contract**. A single transaction places an order, matches it against the book and settles every
trade atomically. No custodian, no matcher, no trusted server - anyone can audit every fill.

## How it works (onchain components)
| Piece | Where |
|---|---|
| Bid/ask books as sorted linked lists (best price first, oldest first) | `OrderBook.sol` `_insert` |
| Matching engine: crosses the book, fills at the maker's price, refunds price improvement | `placeLimitOrder` |
| Escrowed balances: funds are locked at order time, so a fill can never fail | `deposit / withdraw` |
| Events for every order and trade (the UI's trade tape reads them) | `OrderPlaced, Trade, OrderCancelled` |
| Exact integer math: lot-sized amounts/prices mean zero rounding dust, the book is always solvent | `LOT` |

**Transaction flow:** deposit -> `placeLimitOrder` (match + settle + rest remainder) -> `cancelOrder` -> withdraw.

## Run it
```bash
npm install
npm test                 # 6 tests: priority, matching, refunds, cancel, validation
npx hardhat node         # terminal 1 - local chain (chain id 31337)
npm run deploy           # terminal 2 - deploys tokens + book, writes frontend/config.js
npm run demo             # optional: seed liquidity + a crossing trade
npm run frontend         # open http://localhost:3000
```
In MetaMask add network `http://127.0.0.1:8545` (chain id 31337) and import a Hardhat test key.
In the UI: **Connect -> Get test tokens -> Deposit all -> place orders**. Use a second wallet account
to trade against yourself and watch the book match live.

Deploy to a public testnet: `RPC_URL=... PRIVATE_KEY=... npx hardhat run scripts/deploy.js --network testnet`.

## Limitations / next steps
Sorted-list insert is O(n) - a production version would use price-level buckets with a heap/bitmap.
Natural extensions: market orders, maker/taker fees, perpetuals with per-block funding on the same book.

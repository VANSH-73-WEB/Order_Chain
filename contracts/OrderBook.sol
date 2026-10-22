// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amt) external returns (bool);
    function transferFrom(address from, address to, uint256 amt) external returns (bool);
}

/// @title OrderChain - fully onchain limit order book
/// @notice Order storage, price-time priority matching and settlement all happen in this
///         contract. No offchain matcher, relayer or keeper is involved: one transaction
///         places an order, matches it against the book, and settles the trades atomically.
/// @dev Price = quote wei per 1e18 base wei. Amount and price must be multiples of LOT so that
///      amount * price / 1e18 is always exact (no rounding dust, the book is always solvent).
contract OrderBook {
    IERC20 public immutable base;   // asset being traded (e.g. WETH)
    IERC20 public immutable quote;  // pricing asset (e.g. USDC)
    uint256 public constant LOT = 1e9;
    uint256 private constant ONE = 1e18;

    struct Order { address trader; bool isBuy; uint256 price; uint256 amount; uint256 next; }
    struct OrderView { uint256 id; address trader; uint256 price; uint256 amount; }

    mapping(uint256 => Order) public orders;
    uint256 public bestBuy;   // head of bids: highest price first, then oldest
    uint256 public bestSell;  // head of asks: lowest price first, then oldest
    uint256 public nextId = 1;
    mapping(address => uint256) public baseBalance;   // free (unlocked) balances inside the book
    mapping(address => uint256) public quoteBalance;

    event Deposit(address indexed trader, bool isBase, uint256 amount);
    event Withdraw(address indexed trader, bool isBase, uint256 amount);
    event OrderPlaced(uint256 indexed id, address indexed trader, bool isBuy, uint256 price, uint256 amount);
    event OrderCancelled(uint256 indexed id, address indexed trader);
    event Trade(uint256 indexed makerId, address indexed taker, address indexed maker, bool takerIsBuy, uint256 price, uint256 amount);

    constructor(address _base, address _quote) { base = IERC20(_base); quote = IERC20(_quote); }

    // ---------------------------------------------------------------- funds
    function deposit(bool isBase, uint256 amount) external {
        require((isBase ? base : quote).transferFrom(msg.sender, address(this), amount), "transfer failed");
        if (isBase) baseBalance[msg.sender] += amount; else quoteBalance[msg.sender] += amount;
        emit Deposit(msg.sender, isBase, amount);
    }

    function withdraw(bool isBase, uint256 amount) external {
        if (isBase) baseBalance[msg.sender] -= amount; else quoteBalance[msg.sender] -= amount;
        require((isBase ? base : quote).transfer(msg.sender, amount), "transfer failed");
        emit Withdraw(msg.sender, isBase, amount);
    }

    // --------------------------------------------------------------- trading
    /// @notice Place a limit order. Crosses the book first (taker), rests any remainder (maker).
    /// @return id id of the resting order, or 0 if fully filled immediately
    function placeLimitOrder(bool isBuy, uint256 price, uint256 amount) external returns (uint256 id) {
        require(amount > 0 && amount % LOT == 0, "bad amount");
        require(price > 0 && price % LOT == 0, "bad price");

        // lock funds for the full order at the limit price
        if (isBuy) quoteBalance[msg.sender] -= amount * price / ONE;
        else baseBalance[msg.sender] -= amount;

        uint256 remaining = amount;
        while (remaining > 0) {
            uint256 mid = isBuy ? bestSell : bestBuy;
            if (mid == 0) break;
            Order storage m = orders[mid];
            if (isBuy ? m.price > price : m.price < price) break;

            uint256 fill = remaining < m.amount ? remaining : m.amount;
            uint256 cost = fill * m.price / ONE;           // always settles at the maker's price
            if (isBuy) {
                baseBalance[msg.sender] += fill;
                quoteBalance[m.trader] += cost;
                quoteBalance[msg.sender] += fill * price / ONE - cost; // price improvement refund
            } else {
                quoteBalance[msg.sender] += cost;
                baseBalance[m.trader] += fill;
            }
            remaining -= fill;
            m.amount -= fill;
            emit Trade(mid, msg.sender, m.trader, isBuy, m.price, fill);
            if (m.amount == 0) {
                if (isBuy) bestSell = m.next; else bestBuy = m.next;
                delete orders[mid];
            }
        }

        if (remaining > 0) {
            id = nextId++;
            orders[id] = Order(msg.sender, isBuy, price, remaining, 0);
            _insert(id);
            emit OrderPlaced(id, msg.sender, isBuy, price, remaining);
        }
    }

    function cancelOrder(uint256 id) external {
        Order memory o = orders[id];
        require(o.trader == msg.sender, "not your order");
        uint256 cur = o.isBuy ? bestBuy : bestSell;
        uint256 prev = 0;
        while (cur != id) { prev = cur; cur = orders[cur].next; }
        if (prev == 0) { if (o.isBuy) bestBuy = o.next; else bestSell = o.next; }
        else orders[prev].next = o.next;
        if (o.isBuy) quoteBalance[msg.sender] += o.amount * o.price / ONE;
        else baseBalance[msg.sender] += o.amount;
        delete orders[id];
        emit OrderCancelled(id, msg.sender);
    }

    // ----------------------------------------------------------------- views
    function getBook(uint256 depth) external view returns (OrderView[] memory bids, OrderView[] memory asks) {
        bids = _walk(bestBuy, depth);
        asks = _walk(bestSell, depth);
    }

    function _walk(uint256 cur, uint256 depth) internal view returns (OrderView[] memory out) {
        uint256 n; uint256 c = cur;
        while (c != 0 && n < depth) { n++; c = orders[c].next; }
        out = new OrderView[](n);
        for (uint256 i; i < n; i++) {
            Order storage o = orders[cur];
            out[i] = OrderView(cur, o.trader, o.price, o.amount);
            cur = o.next;
        }
    }

    // ------------------------------------------------------------- internals
    /// @dev sorted insert keeping price-time priority (equal prices go behind older orders)
    function _insert(uint256 id) internal {
        Order storage o = orders[id];
        uint256 cur = o.isBuy ? bestBuy : bestSell;
        uint256 prev = 0;
        while (cur != 0 && (o.isBuy ? orders[cur].price >= o.price : orders[cur].price <= o.price)) {
            prev = cur; cur = orders[cur].next;
        }
        o.next = cur;
        if (prev == 0) { if (o.isBuy) bestBuy = id; else bestSell = id; }
        else orders[prev].next = id;
    }
}

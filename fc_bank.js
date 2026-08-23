function autoBankAction() {
    if (!B || hasClickBuff()) return;

    //Upgrade bank level
    let currentOffice = B.offices[B.officeLevel];
    if (
        currentOffice.cost &&
        Game.Objects["Cursor"].amount >= currentOffice.cost[0] &&
        Game.Objects["Cursor"].level >= currentOffice.cost[1]
    ) {
        var countBankCursor = currentOffice.cost[0];
        l("bankOfficeUpgrade").click();
        safeBuy(Game.Objects["Cursor"], countBankCursor);
        FrozenCookies.autobuyCount += 1;
        logEvent(
            "AutoBank",
            "Upgrade bank level for " + countBankCursor + " cursors"
        );
        Game.recalculateGains = 1;
        Game.upgradesToRebuild = 1;
    }
}

function autoBrokerAction() {
    if (!B) return; // Just leave if you don't have the stock market

    //Hire brokers
    var delay = delayAmount(); //GC or harvest bank
    var recommendation = nextPurchase();
    if (
        recommendation.type == "building" && // Don't hire when saving for upgrade
        B.brokers < B.getMaxBrokers() &&
        Game.cookies >= delay + B.getBrokerPrice()
    ) {
        l("bankBrokersBuy").click();
        logEvent(
            "AutoBroker",
            "Hired a broker for " + Beautify(B.getBrokerPrice()) + " cookies"
        );
        Game.recalculateGains = 1;
        Game.upgradesToRebuild = 1;
    }
}

// Sniper stock bot: buy stocks at very low prices, sell after a downtrend.
// Ported from a standalone console script; gated on the autoStock menu toggle.
function autoStockAction() {
    if (!FrozenCookies.autoStock) return;
    if (Game.T % 30 !== 0) return; // check once per second (prices update every 60s)
    if (!B || Game.OnAscend) return;

    var BUY_AT = 5; // buy aggressively at or below this price

    var lvl = Game.Objects["Bank"].level;
    var reserve = FrozenCookies.minCookies || 0;

    B.goodsById.forEach(function (g) {
        if (!g.active) return;
        var resting = 10 * (g.id + 1) + (lvl - 1);
        var sellMin = Math.min(50, resting + 25); // adjust cheap stocks to a realistic level

        var twoDownTicks =
            g.vals.length >= 3 &&
            g.vals[0] < g.vals[1] &&
            g.vals[1] < g.vals[2];

        if (g.stock > 0 && g.val > sellMin && twoDownTicks) {
            var qty = g.stock;
            if (B.sellGood(g.id, 10000))
                logEvent(
                    "AutoStock",
                    "SELL " + g.symbol + " x" + qty + " @ $" + g.val.toFixed(2)
                );
        } else if (g.val <= BUY_AT) {
            var unitCost = g.val * Game.cookiesPsRawHighest * 1.2;
            var afford = Math.floor((Game.cookies - reserve) / unitCost);
            var n = Math.min(afford, B.getGoodMaxStock(g) - g.stock);
            if (n > 0 && B.buyGood(g.id, n))
                logEvent(
                    "AutoStock",
                    "BUY " + g.symbol + " x" + n + " @ $" + g.val.toFixed(2)
                );
        }
    });
}

function autoLoanBuy() {
    if (!B || B.officelevel < 2) return;

    if (
        hasClickBuff() &&
        !Game.hasBuff("Cursed finger") &&
        cpsBonus() >= FrozenCookies.minLoanMult
    ) {
        if (B.officeLevel >= 2) B.takeLoan(1);
        if (B.officeLevel >= 4) B.takeLoan(2);
        if (B.officeLevel >= 5 && FrozenCookies.autoLoan == 2) B.takeLoan(3);
    }
}

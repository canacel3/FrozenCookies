// fc_garden.js: Garden (Farm minigame) automation.
// Unlocks all 34 seeds phase by phase, farms Juicy Queenbeets for sugar lumps,
// then sacrifices the garden (+10 lumps) and starts the loop over.
// Design/coordinates: garden_自動化仕様書.md.
// The bot is stateless: every pass re-derives the current phase from the set of
// unlocked seeds and the plot, so it recovers from reloads, ascensions and
// toggling the setting. Emergency stop: window.gardenBotEnabled = false.

var GARDEN_SOIL_FERTILIZER = 1;
var GARDEN_SOIL_WOODCHIPS = 4;
// Meddleweed seed drop chance is age x 0.1% and it dies of old age one tick
// after ~84, so harvest right below the cap.
var GARDEN_MEDDLEWEED_HARVEST_AGE = 84;
var GARDEN_X_EVEN = [0, 2, 4];
var GARDEN_X_ODD = [1, 3, 5];
var GARDEN_X_ALL = [0, 1, 2, 3, 4, 5];
// Lanes are restricted to x0-3 while the weed zone (x4-5) is active
var GARDEN_X_LEFT = [0, 1, 2, 3];

// Seeds that only the P16 queenbeet grid can produce
var GARDEN_LATE_SEEDS = {
    queenbeetLump: 1,
    duketater: 1,
    shriekbulb: 1,
};

// The recipes that use cronerice as a parent; the trio at (0,4),(2,4),(4,4)
// stays planted until all of them are secured, then hands lane 2 to P12b.
var GARDEN_CRONERICE_USERS = ["gildmillet", "elderwort", "wardlichen"];

function gardenRow(key, y, xs) {
    return xs.map(function (x) {
        return { key: key, x: x, y: y };
    });
}

function gardenZoneRows(ys, xs) {
    var cells = [];
    ys.forEach(function (y) {
        xs.forEach(function (x) {
            cells.push({ x: x, y: y });
        });
    });
    return cells;
}

// Golden clover wiki layout (0-indexed), full 6-row version: by the time P15
// runs, the elderwort shelf has retired (its consumers ichorpuff/everdaisy
// are prerequisites of reaching P15), so the bottom row is free again.
var GARDEN_P15_PLOTS = [
    [0, 0], [1, 0], [3, 0], [5, 0],
    [1, 1], [3, 1], [5, 1],
    [0, 2], [3, 2], [5, 2],
    [0, 3], [2, 3], [5, 3],
    [0, 4], [2, 4], [4, 4],
    [0, 5], [2, 5], [4, 5], [5, 5],
];

function gardenP15Cells() {
    return GARDEN_P15_PLOTS.map(function (c) {
        return { key: "clover", x: c[0], y: c[1] };
    });
}

function gardenP15Zone() {
    var used = {};
    GARDEN_P15_PLOTS.forEach(function (c) {
        used[c[0] + "," + c[1]] = 1;
    });
    var zone = [];
    for (var y = 0; y < 6; y++) {
        for (var x = 0; x < 6; x++) {
            if (!used[x + "," + y]) zone.push({ x: x, y: y });
        }
    }
    return zone;
}

// Mutation phases in progression order. A phase is active when its targets are
// still locked, all its parent seeds are unlocked, and none of its tiles are
// claimed by an earlier phase or fixture. `partial` phases (background Baker's
// wheat for the 0.1% bakeberry mutation) just use whatever tiles are free.
// The P16 queenbeet grid is handled separately in gardenBuildPlan().
var gardenPhases = [
    { id: "P1", targets: ["thumbcorn"],
        cells: gardenRow("bakerWheat", 1, GARDEN_X_LEFT),
        zone: gardenZoneRows([0, 2], GARDEN_X_LEFT) },
    { id: "P2", targets: ["cronerice"],
        cells: gardenRow("bakerWheat", 1, [0, 2]).concat(gardenRow("thumbcorn", 1, [1, 3])),
        zone: gardenZoneRows([0, 2], GARDEN_X_LEFT) },
    // If bakeberry gets secured before cronerice, duplicate the P2 recipe on
    // the freed lane 2: cronerice gates the whole midgame chain (P6-P9), and
    // the weeds get their big window during its 74-tick maturation anyway,
    // when both lanes are torn down and the board sits nearly empty.
    { id: "P2b", targets: ["cronerice"], requireHave: ["bakeberry"],
        cells: gardenRow("bakerWheat", 4, [0, 2]).concat(gardenRow("thumbcorn", 4, [1, 3])),
        zone: gardenZoneRows([3, 5], GARDEN_X_LEFT) },
    // Weed farming for brown mold + crumbspore: x4-5 stays reserved as a
    // guaranteed spawn corridor, but weeds are farmed on any safe empty tile
    // (see gardenWeedFarmable) - once the bakeberry filler retires, the freed
    // rows open up more spawn tiles. Soil stays fertilizer while active.
    { id: "P3", targets: ["brownMold", "crumbspore"], weed: true },
    { id: "P4", targets: ["chocoroot", "whiteMildew"],
        cells: gardenRow("bakerWheat", 1, [0, 2]).concat(gardenRow("brownMold", 1, [1, 3])),
        zone: gardenZoneRows([0, 2], GARDEN_X_LEFT) },
    { id: "P5", targets: ["whiteChocoroot"],
        cells: gardenRow("chocoroot", 1, [0, 2]).concat(gardenRow("whiteMildew", 1, [1, 3])),
        zone: gardenZoneRows([0, 2], GARDEN_X_LEFT) },
    { id: "P6", targets: ["gildmillet"],
        cells: gardenRow("cronerice", 4, GARDEN_X_EVEN).concat(gardenRow("thumbcorn", 4, GARDEN_X_ODD)),
        zone: gardenZoneRows([3, 5], GARDEN_X_ALL) },
    { id: "P7", targets: ["clover"],
        cells: gardenRow("bakerWheat", 1, GARDEN_X_EVEN).concat(gardenRow("gildmillet", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P8", targets: ["shimmerlily"],
        cells: gardenRow("clover", 1, GARDEN_X_EVEN).concat(gardenRow("gildmillet", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P9", targets: ["elderwort"],
        cells: gardenRow("cronerice", 4, GARDEN_X_EVEN).concat(gardenRow("shimmerlily", 4, GARDEN_X_ODD)),
        zone: gardenZoneRows([3, 5], GARDEN_X_ALL) },
    { id: "P10-1", targets: ["greenRot"],
        cells: gardenRow("whiteMildew", 1, GARDEN_X_EVEN).concat(gardenRow("clover", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P10-2", targets: ["keenmoss"],
        cells: gardenRow("greenRot", 1, GARDEN_X_EVEN).concat(gardenRow("brownMold", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    // Contamination-splitting layout: the mushroom keeps even spacing on row
    // 0, the partner sits on row 2 (two rows apart: no orthogonal contact),
    // and the shared mutation row y=1 between them touches both species.
    // Staying inside rows 0-2 leaves lane 2 (rows 3-5) free, so these run in
    // parallel with P9/P12b instead of conflicting with their zones.
    { id: "P10-3", targets: ["wrinklegill"],
        cells: gardenRow("crumbspore", 0, GARDEN_X_EVEN).concat(gardenRow("brownMold", 2, GARDEN_X_EVEN)),
        zone: gardenZoneRows([1], GARDEN_X_ALL) },
    { id: "P10-4", targets: ["glovemorel"],
        cells: gardenRow("crumbspore", 0, GARDEN_X_EVEN).concat(gardenRow("thumbcorn", 2, GARDEN_X_EVEN)),
        zone: gardenZoneRows([1], GARDEN_X_ALL) },
    { id: "P10-5", targets: ["cheapcap"],
        cells: gardenRow("crumbspore", 0, GARDEN_X_EVEN).concat(gardenRow("shimmerlily", 2, GARDEN_X_EVEN)),
        zone: gardenZoneRows([1], GARDEN_X_ALL) },
    // doughshroom needs crumbspore M x2 at once -> keep the generation in sync
    { id: "P10-6", targets: ["doughshroom"], syncSpecies: "crumbspore",
        cells: gardenRow("crumbspore", 1, GARDEN_X_EVEN),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P10-7", targets: ["foolBolete"],
        cells: gardenRow("doughshroom", 0, GARDEN_X_EVEN).concat(gardenRow("greenRot", 2, GARDEN_X_EVEN)),
        zone: gardenZoneRows([1], GARDEN_X_ALL) },
    { id: "P10-8", targets: ["wardlichen"],
        cells: gardenRow("cronerice", 4, GARDEN_X_EVEN).concat(gardenRow("whiteMildew", 4, [1, 3])),
        zone: gardenZoneRows([3, 5], GARDEN_X_ALL) },
    { id: "P10-9", targets: ["drowsyfern"],
        cells: gardenRow("chocoroot", 1, GARDEN_X_EVEN).concat(gardenRow("keenmoss", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P11-1", targets: ["whiskerbloom"],
        cells: gardenRow("shimmerlily", 1, GARDEN_X_EVEN).concat(gardenRow("whiteChocoroot", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    // Lane-2 duplicate (same pattern as P2b/P12b): keeps the whiskerbloom
    // hunt rolling when lane 1 is lent to a mushroom phase, and doubles it
    // when both lanes are free.
    { id: "P11-1b", targets: ["whiskerbloom"],
        cells: gardenRow("shimmerlily", 4, GARDEN_X_EVEN).concat(gardenRow("whiteChocoroot", 4, GARDEN_X_ODD)),
        zone: gardenZoneRows([3, 5], GARDEN_X_ALL) },
    // nursetulip needs whiskerbloom M x2 at once -> keep the generation in sync
    { id: "P11-2", targets: ["nursetulip"], syncSpecies: "whiskerbloom",
        cells: gardenRow("whiskerbloom", 1, GARDEN_X_ALL),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P11-3", targets: ["chimerose"],
        cells: gardenRow("shimmerlily", 1, GARDEN_X_EVEN).concat(gardenRow("whiskerbloom", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    // tidygrass is 0.2%, so run the same recipe on both lanes when lane 2 is free
    { id: "P12a", targets: ["tidygrass"],
        cells: gardenRow("bakerWheat", 1, GARDEN_X_EVEN).concat(gardenRow("whiteChocoroot", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P12b", targets: ["tidygrass"],
        cells: gardenRow("bakerWheat", 4, GARDEN_X_EVEN).concat(gardenRow("whiteChocoroot", 4, GARDEN_X_ODD)),
        zone: gardenZoneRows([3, 5], GARDEN_X_ALL) },
    // The elderwort shelf cells are listed as parents so the soil logic waits
    // for them to mature before switching to wood chips.
    { id: "P13", targets: ["ichorpuff"],
        cells: gardenRow("crumbspore", 3, [1, 3, 5]).concat(gardenRow("elderwort", 5, GARDEN_X_ALL)),
        zone: gardenZoneRows([4], GARDEN_X_ALL) },
    { id: "P14", targets: ["everdaisy"],
        cells: gardenRow("tidygrass", 3, GARDEN_X_ALL).concat(gardenRow("elderwort", 5, GARDEN_X_ALL)),
        zone: gardenZoneRows([4], [1, 2, 3, 4]) },
    { id: "P16a", targets: ["queenbeet"],
        cells: gardenRow("bakeberry", 1, GARDEN_X_EVEN).concat(gardenRow("chocoroot", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    // Evaluated after P16a on purpose: the queenbeet hunt is a short, already
    // -invested sprint whose sprout then frees the whole board for ~67 ticks
    // - almost exactly goldenClover's expected hunt time - so P15 slots into
    // that window instead of evicting a growing bakeberry row.
    { id: "P15", targets: ["goldenClover"],
        cells: gardenP15Cells(),
        zone: gardenP15Zone() },
    // Everdaisy booster: with queenbeet secured, lane 1 has nothing left to
    // hunt until everdaisy lands, so grow a second elderwort row on y=1.
    // Once mature, (1,2)-(4,2) see 3 elderwort above + 3 tidygrass below,
    // doubling the everdaisy mutation cells. `aux` keeps this slow row (8h+)
    // out of the soil-maturity gate so it can't delay the wood chips switch.
    { id: "P14b", targets: ["everdaisy"], aux: true,
        cells: gardenRow("elderwort", 1, GARDEN_X_ALL),
        zone: gardenZoneRows([2], [1, 2, 3, 4]) },
    // Background wheat lanes: bakeberry is only 0.1%, so keep wheat in any free
    // lane tiles from P1 all the way until it finally unlocks.
    { id: "fillerL1", targets: ["bakeberry"], partial: true,
        cells: gardenRow("bakerWheat", 1, GARDEN_X_LEFT),
        zone: gardenZoneRows([0, 2], GARDEN_X_LEFT) },
    // Once the cronerice trio has retired (all three of its recipes secured),
    // lane 2 belongs to bakeberry outright: a full wheat row 4 turns all 12
    // cells of rows 3/5 into mutation slots. Declared before the comb version
    // below; its zone claims keep the comb from wheating the mutation rows.
    { id: "fillerL2-open", targets: ["bakeberry"], partial: true,
        requireHave: GARDEN_CRONERICE_USERS,
        cells: gardenRow("bakerWheat", 4, GARDEN_X_ALL),
        zone: gardenZoneRows([3, 5], GARDEN_X_ALL) },
    // With the cronerice trio still holding the even row-4 cells, wheat on
    // rows 3/5 (even x) turns the odd cells of those rows into bakeberry
    // mutation slots: 6 eligible cells instead of 4. Partial, so any real
    // phase that needs these rows takes priority automatically.
    { id: "fillerL2", targets: ["bakeberry"], partial: true,
        cells: gardenRow("bakerWheat", 4, [0, 1, 2, 3, 5])
            .concat(gardenRow("bakerWheat", 3, GARDEN_X_EVEN))
            .concat(gardenRow("bakerWheat", 5, GARDEN_X_EVEN)),
        zone: gardenZoneRows([3, 5], GARDEN_X_ALL) },
];

// Lane-1 layouts (standard forms and the y0-2 contamination-split forms) may
// relocate +3 rows onto lane 2 when their home tiles are claimed by another
// phase or squatted by a protected sprout.
gardenPhases.forEach(function (p) {
    if (["P1", "P2", "P4", "P5", "P7", "P8", "P10-1", "P10-2", "P10-3", "P10-4",
        "P10-5", "P10-6", "P10-7", "P10-9", "P11-1", "P11-2", "P11-3", "P12a",
        "P16a"].indexOf(p.id) !== -1) {
        p.shiftable = true;
    }
});

function gardenUnlocked(key) {
    return !!(G.plants[key] && G.plants[key].unlocked);
}

function gardenNeighbors(x, y) {
    var out = [];
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            var nx = x + dx;
            var ny = y + dy;
            if (nx >= 0 && nx < 6 && ny >= 0 && ny < 6) out.push({ x: nx, y: ny });
        }
    }
    return out;
}

function gardenLog(action, detail) {
    if (!window.gardenBotLog) window.gardenBotLog = [];
    window.gardenBotLog.push({ time: Date.now(), action: action, detail: detail });
    if (window.gardenBotLog.length > 500) window.gardenBotLog.shift();
    logEvent("Garden", action + ": " + detail);
}

// Log newly unlocked seeds (the game itself already pops a notification).
function gardenNoticeUnlocks() {
    var seen = FrozenCookies.gardenSeenSeeds;
    var first = !seen;
    if (first) seen = {};
    Object.keys(G.plants).forEach(function (key) {
        if (G.plants[key].unlocked) {
            if (!seen[key]) {
                seen[key] = 1;
                if (!first) {
                    gardenLog("unlock", key + " (" + G.plantsUnlockedN + "/" + (G.plantsN || 34) + ")");
                }
            }
        } else if (seen[key]) {
            delete seen[key]; // sacrifice reset the seed log
        }
    });
    FrozenCookies.gardenSeenSeeds = seen;
}

// Build the desired board layout for this pass. plan.claims maps "x,y" to
// {kind: "plant"|"zone"|"weed", key, phase}; first claim wins, so fixtures and
// earlier phases have priority.
function gardenBuildPlan() {
    var plan = {
        claims: {},
        active: [], // [{phase, cells}] used by the soil logic
        deferred: {}, // "x,y" -> true: claimed but not planted yet (short-lived partner waits)
        territory: {}, // "x,y" -> true: cells+zones of active phases, even lazily unclaimed ones
        weedActive: false,
        gridActive: false,
        gridCull: false, // harvest leftover queenbeets so the grid replants in lockstep
        gridMedian: null, // cohort median age; beets >20 age away get culled
        thinDup: {}, // "x,y" -> true: duplicate locked sprout squatting a JQB hole
        jqb: null,
    };

    function claim(x, y, kind, key, phase) {
        var id = x + "," + y;
        if (!plan.claims[id]) plan.claims[id] = { kind: kind, key: key, phase: phase };
    }

    function freeFor(c) {
        var cur = plan.claims[c.x + "," + c.y];
        return !cur || (cur.kind === "plant" && cur.key === c.key);
    }

    // One board scan: which species are present, and is a Juicy queenbeet
    // growing (never removed; harvested at 85+ for a lump)?
    var present = {};
    var jqbId = G.plants["queenbeetLump"].id;
    for (var jy = 0; jy < 6; jy++) {
        for (var jx = 0; jx < 6; jx++) {
            var jt = G.plot[jy][jx];
            if (!jt[0]) continue;
            present[G.plantsById[jt[0] - 1].key] = true;
            if (jt[0] - 1 === jqbId) {
                plan.jqb = { x: jx, y: jy, age: jt[1] };
            }
        }
    }
    plan.present = present;

    // A target counts as secured once its seed is unlocked OR a specimen is
    // already growing on the board: the cleanup pass protects locked species
    // until harvest wherever they sit, so the parents can be released as soon
    // as the mutation lands. This frees a lane during slow maturations
    // (drowsyfern ~300 ticks, everdaisy ~250) and, for the bakeberry filler,
    // clears the wheat so weed-spawn tiles open up while P3 is running. If the
    // specimen is lost unharvested (e.g. harvestAll on ascension) the phase
    // simply reactivates and the parents get rebuilt.
    function have(key) {
        return gardenUnlocked(key) || !!present[key];
    }

    // The grid starts once the pre-grid seeds are SECURED (unlocked or
    // sprouted): the 27 queenbeets can grow out while e.g. the everdaisy
    // sprout finishes its ~250-tick maturation, saving half a day per cycle.
    // Queenbeet itself must be truly unlocked (it has to be plantable) and
    // the sacrifice gate stays strictly unlock-based.
    var preComplete = gardenUnlocked("queenbeet") && Object.keys(G.plants).every(function (key) {
        return GARDEN_LATE_SEEDS[key] || have(key);
    });
    var lateComplete = gardenUnlocked("queenbeetLump") && gardenUnlocked("duketater") && gardenUnlocked("shriekbulb");
    plan.gridActive = preComplete && (!lateComplete || !!plan.jqb);

    // One maturing specimen per locked species is enough for the unlock:
    // keep only the eldest sprout of each species (the fastest path to the
    // seed) and thin every other duplicate so it stops squatting a mutation
    // cell. Same-age duplicates offer no real insurance either (they share
    // the same harvest window). Meddleweed (farmed in bulk during P3) and the
    // JQB are exempt.
    var eldest = {};
    for (var ty = 0; ty < 6; ty++) {
        for (var tx = 0; tx < 6; tx++) {
            var tt = G.plot[ty][tx];
            if (!tt[0]) continue;
            var tp = G.plantsById[tt[0] - 1];
            if (tp.unlocked || tp.key === "queenbeetLump" || tp.key === "meddleweed") continue;
            if (!(tp.key in eldest) || tt[1] > eldest[tp.key].age) {
                eldest[tp.key] = { x: tx, y: ty, age: tt[1] };
            }
        }
    }
    for (var dy = 0; dy < 6; dy++) {
        for (var dx = 0; dx < 6; dx++) {
            var dt = G.plot[dy][dx];
            if (!dt[0]) continue;
            var dp = G.plantsById[dt[0] - 1];
            if (dp.unlocked || dp.key === "queenbeetLump" || dp.key === "meddleweed") continue;
            var top = eldest[dp.key];
            if (top && !(top.x === dx && top.y === dy)) {
                plan.thinDup[dx + "," + dy] = true;
            }
        }
    }

    // Fixture: resident elderwort shelf on y=5, kept while its consumers
    // (P13 ichorpuff, P14 everdaisy) are still open; retiring it afterwards
    // frees the bottom row for P15's full clover layout.
    var shelfDone = have("ichorpuff") && have("everdaisy");
    if (gardenUnlocked("elderwort") && !shelfDone && !plan.gridActive) {
        GARDEN_X_ALL.forEach(function (x) {
            claim(x, 5, "plant", "elderwort", "shelf");
        });
    }

    // Fixture: cronerice trio, planted in P2 and kept while any recipe that
    // needs it is still open (regrowing it later would cost 74 ticks)
    var cronericeDone = GARDEN_CRONERICE_USERS.every(have);
    if (gardenUnlocked("cronerice") && !cronericeDone) {
        GARDEN_X_EVEN.forEach(function (x) {
            claim(x, 4, "plant", "cronerice", "trio");
        });
    }

    if (plan.gridActive) {
        if (plan.jqb) {
            // Protect the JQB tile itself
            claim(plan.jqb.x, plan.jqb.y, "plant", "queenbeetLump", "P16-jqb");
            // Refill tiles where a neighboring queenbeet died with elderwort:
            // each one ages the JQB 3% faster. Living queenbeets are left alone.
            if (gardenUnlocked("elderwort")) {
                gardenNeighbors(plan.jqb.x, plan.jqb.y).forEach(function (c) {
                    var t = G.plot[c.y][c.x];
                    if (t[0] === 0 || G.plantsById[t[0] - 1].key === "elderwort") {
                        claim(c.x, c.y, "plant", "elderwort", "P16-ring");
                    }
                });
            }
        }
        // The corner hole (5,5) only has 3 neighbors, so it can never roll
        // JQB (needs 8) or shriekbulb (needs 5): it's a duketater-only slot.
        // Once duketater is secured it becomes worthless as a hole, so farm a
        // Baker's wheat there for its +1% CpS passive instead.
        if (have("duketater") && gardenUnlocked("bakerWheat")) {
            claim(5, 5, "plant", "bakerWheat", "P16-cps");
        }
        // Retirement: once a JQB is growing and duketater/shriekbulb are
        // secured, the rest of the grid has nothing left to produce (the
        // elderwort ring shares tiles with every other JQB hole, and the side
        // holes only roll junk). Stop replanting queenbeets; each remaining
        // one is harvested at maturity for its yield, and every freed tile
        // (holes included) grows Baker's wheat for its +1% CpS passive.
        plan.gridRetire = !!plan.jqb && have("duketater") && have("shriekbulb");

        // Queenbeet grid: plant everything except the 9 odd/odd tiles, the
        // JQB/duketater/shriekbulb mutation slots ((5,5) may already be
        // claimed as wheat above; first claim wins).
        var gridCells = [];
        var qbId = G.plants["queenbeet"].id;
        for (var gy = 0; gy < 6; gy++) {
            for (var gx = 0; gx < 6; gx++) {
                if (gx % 2 === 1 && gy % 2 === 1) {
                    if (plan.gridRetire && gardenUnlocked("bakerWheat")) {
                        claim(gx, gy, "plant", "bakerWheat", "P16-cps");
                    } else {
                        claim(gx, gy, "zone", null, "P16-grid");
                    }
                    continue;
                }
                if (plan.claims[gx + "," + gy]) continue; // JQB / ring / (5,5) wheat
                if (plan.gridRetire && G.plot[gy][gx][0] - 1 !== qbId) {
                    claim(gx, gy, "plant", "bakerWheat", "P16-cps");
                    continue;
                }
                claim(gx, gy, "plant", "queenbeet", "P16-grid");
                gridCells.push({ key: "queenbeet", x: gx, y: gy });
            }
        }
        // Generation sync: queenbeets are mature for only ~17 of their ~83
        // ticks and the holes need 5-8 of them mature AT ONCE, so replanting
        // each death individually drifts the cohort out of phase and kills
        // the odds. Mid-generation gaps stay empty (a late plant could never
        // mature before the cohort dies anyway); once more than half the
        // generation is gone, the stragglers are culled and the whole grid
        // replants in lockstep.
        if (plan.gridRetire) {
            // hold each retiring beet's tile for the pass it's harvested in;
            // the next pass reclaims it as wheat
            gridCells.forEach(function (c) {
                plan.deferred[c.x + "," + c.y] = true;
            });
        }

        var qbAges = [];
        var qbEmpty = 0;
        gridCells.forEach(function (c) {
            var t = G.plot[c.y][c.x];
            if (t[0] - 1 === qbId) qbAges.push(t[1]);
            else if (t[0] === 0) qbEmpty++;
        });
        if (plan.gridRetire) {
            // no generation management while winding down
        } else if (qbAges.length > 0 && qbEmpty > qbAges.length) {
            plan.gridCull = true; // most of the generation is gone: full reset
        } else if (qbAges.length > 0) {
            // The mature window is ages 80-100, so a beet more than 20 age
            // units from the cohort median can never be mature together with
            // it: cull it (via gridMedian in the cleanup pass) and keep its
            // tile empty until the next generation. Also heals cohorts
            // planted before this rule existed.
            qbAges.sort(function (a, b) { return a - b; });
            plan.gridMedian = qbAges[Math.floor(qbAges.length / 2)];
            gridCells.forEach(function (c) {
                var t = G.plot[c.y][c.x];
                var outlier = t[0] - 1 === qbId && Math.abs(t[1] - plan.gridMedian) > 20;
                // A gap early in a generation can still join the cohort (the
                // mature window is 20 age wide), so refill it; only hold the
                // tile once the cohort is too old to catch up to.
                var lateGap = t[0] === 0 && plan.gridMedian > 20;
                if (lateGap || outlier) plan.deferred[c.x + "," + c.y] = true;
            });
        }
        plan.active.push({ phase: { id: "P16-grid" }, cells: gridCells });
    }

    gardenPhases.forEach(function (phase) {
        if (phase.targets.every(have)) return; // done (unlocked or sprouted)
        if (phase.weed) {
            plan.weedActive = true;
            // The x4-5 spawn corridor is only needed while meddleweed itself
            // is locked (the first weed of a cycle must spawn naturally);
            // once unlocked we sow weeds directly instead.
            if (!gardenUnlocked("meddleweed")) {
                for (var wy = 0; wy < 6; wy++) {
                    for (var wx = 4; wx < 6; wx++) {
                        claim(wx, wy, "weed", null, phase.id);
                    }
                }
            }
            return;
        }
        if (phase.requireHave && !phase.requireHave.every(have)) return; // conditional duplicate not warranted yet
        if (!phase.cells.every(function (c) { return gardenUnlocked(c.key); })) return; // parents not available yet
        var cells = phase.cells;
        var zone = phase.zone || [];
        if (phase.partial) {
            cells = cells.filter(freeFor);
            if (!cells.length) return;
        } else {
            // Lane switch: pick the variant (home lane 1, or mirrored onto
            // lane 2 for shiftable layouts) whose tiles are free of claims,
            // preferring the one with the fewest unplantable parent tiles -
            // e.g. a drowsyfern maturing for 300 ticks on a greenRot cell
            // sends the whole recipe to the other lane instead of running
            // short-handed. Mirroring (y -> 5-y) rather than +3 keeps the
            // contamination-split mushrooms on the outer edge row, away from
            // the other lane's mutation rows.
            var blockedCell = function (c) {
                var t = G.plot[c.y][c.x];
                if (t[0] > 0 && !G.plantsById[t[0] - 1].unlocked &&
                    G.plantsById[t[0] - 1].key !== c.key) return true; // squatting sprout
                if ((c.key === "crumbspore" || c.key === "doughshroom") &&
                    gardenContamRisk(c.x, c.y)) return true; // contaminator can't plant here
                return false;
            };
            var options = [{ cells: cells, zone: zone }];
            if (phase.shiftable) {
                options.push({
                    cells: cells.map(function (c) { return { key: c.key, x: c.x, y: 5 - c.y }; }),
                    zone: zone.map(function (c) { return { x: c.x, y: 5 - c.y }; }),
                });
            }
            options = options.filter(function (o) { return o.cells.every(freeFor); });
            if (!options.length) return; // every lane is held by an earlier phase
            // Tiebreak: prefer the lane that overlaps other phases' territory
            // (cells AND mutation rows, even lazily unclaimed ones) the least.
            // Squeezing into a borrowed mutation row is a last resort - it
            // ends in eviction and contamination wear - so a genuinely free
            // lane always wins over the home lane of a busy one.
            var overlap = function (o) {
                var n = 0;
                o.cells.concat(o.zone).forEach(function (c) {
                    if (plan.territory[c.x + "," + c.y]) n++;
                });
                return n;
            };
            options.sort(function (a, b) {
                var d = overlap(a) - overlap(b);
                if (d) return d;
                return a.cells.filter(blockedCell).length - b.cells.filter(blockedCell).length;
            });
            cells = options[0].cells;
            zone = options[0].zone;
            // Column dodge: a single squatted or contamination-blocked tile
            // needn't cripple its recipe pair. Sliding just that parent one
            // tile sideways keeps the geometry valid (rows are what matter:
            // split-form partners stay 2 rows apart, standard-form parents
            // stay in the parent row) and restores the pairing.
            var origCells = cells;
            cells = cells.map(function (c) {
                if (!blockedCell(c)) return c;
                var alts = [c.x + 1, c.x - 1];
                for (var ai = 0; ai < alts.length; ai++) {
                    if (alts[ai] < 0 || alts[ai] > 5) continue;
                    var alt = { key: c.key, x: alts[ai], y: c.y };
                    if (!freeFor(alt) || blockedCell(alt)) continue;
                    if (origCells.some(function (o) { return o.x === alt.x && o.y === alt.y; })) continue;
                    return alt;
                }
                return c; // no dodge available: keep home (stays unplanted)
            });
        }
        cells.forEach(function (c) {
            claim(c.x, c.y, "plant", c.key, phase.id);
        });
        // Defer planting short-lived parents while a slow co-parent is still
        // far from mature: mutations need both parents mature at once, and
        // e.g. thumbcorn would die ~5 times over while cronerice grows for
        // P6. Wait until this planting will still be reasonably young (age
        // <=70) when the slowest partner matures. Fixture tiles (trio/shelf)
        // plant on their own terms.
        cells.forEach(function (c) {
            var mine = plan.claims[c.x + "," + c.y];
            if (!mine || mine.phase !== phase.id) return;
            // Per partner species the wait is until ANY ONE of its plants is
            // mature (one mature partner keeps the recipe rolling, so a lone
            // fresh replacement in an otherwise mature trio must not stall
            // us); the cell then waits for the slowest such species. No flat
            // floor: for extreme agers like greenRot (18.5 age/tick, ~5 tick
            // lifespan) even a 15-tick wait wastes several generations.
            var partnerBest = {};
            cells.forEach(function (o) {
                if (o.key === c.key) return;
                var p = G.plants[o.key];
                var avg = p.ageTick + p.ageTickR / 2;
                var t = G.plot[o.y][o.x];
                var ticks;
                if (t[0] - 1 === p.id) {
                    ticks = t[1] >= p.mature ? 0 : (p.mature - t[1]) / avg;
                } else {
                    ticks = p.mature / avg; // empty or junk: a full regrow
                }
                if (!(o.key in partnerBest) || ticks < partnerBest[o.key]) {
                    partnerBest[o.key] = ticks;
                }
            });
            var partnerTicks = 0;
            Object.keys(partnerBest).forEach(function (k) {
                partnerTicks = Math.max(partnerTicks, partnerBest[k]);
            });
            var self = G.plants[c.key];
            var selfAvg = self.ageTick + self.ageTickR / 2;
            if (selfAvg * partnerTicks > 70) {
                plan.deferred[c.x + "," + c.y] = true;
            }
        });
        // Recipes needing two mature plants of the SAME species drift out of
        // phase if each death is replanted on its own (a fresh plant matures
        // right when the survivors die, so pairs are never jointly mature).
        // Wait for the whole group to die, then replant it as one generation.
        if (phase.syncSpecies) {
            var anyAlive = cells.some(function (c) {
                return c.key === phase.syncSpecies &&
                    G.plot[c.y][c.x][0] - 1 === G.plants[c.key].id;
            });
            if (anyAlive) {
                cells.forEach(function (c) {
                    if (c.key !== phase.syncSpecies) return;
                    if (!G.plot[c.y][c.x][0]) plan.deferred[c.x + "," + c.y] = true;
                });
            }
        }
        // Lazy zones: while some of this phase's parents are still deferred
        // (waiting on a slow partner), no mutation can land anyway, so the
        // mutation rows stay unclaimed and a later phase or filler can keep
        // working there (e.g. the whiskerbloom hunt keeps rolling on row 1
        // while P10-7's doughshroom spends 42 ticks maturing). Once the
        // deferral lifts, the zone gets claimed and squatters are evicted
        // with a few ticks to spare before the rolls start.
        var hasDeferred = cells.some(function (c) {
            return plan.deferred[c.x + "," + c.y];
        });
        if (!hasDeferred) {
            zone.forEach(function (c) {
                claim(c.x, c.y, "zone", null, phase.id);
            });
        }
        cells.concat(zone).forEach(function (c) {
            plan.territory[c.x + "," + c.y] = true;
        });
        plan.active.push({ phase: phase, cells: cells });
    });

    // Once meddleweed is unlocked, don't wait for natural spawns: sow it on
    // every safe tile and farm it at age 84 (harvest drops roll the same for
    // sown and spawned weeds). Runs after the phase loop so lanes, fillers and
    // fixtures keep priority; the safety rule keeps weeds away from anything
    // contaminable.
    if (plan.weedActive && gardenUnlocked("meddleweed")) {
        for (var my = 0; my < 6; my++) {
            for (var mx = 0; mx < 6; mx++) {
                var mt = G.plot[my][mx];
                if (mt[0] && G.plantsById[mt[0] - 1].key !== "meddleweed") continue;
                if (gardenWeedFarmable(plan, mx, my)) {
                    claim(mx, my, "plant", "meddleweed", "P3-sow");
                }
            }
        }
    }

    // CpS backfill: any tile that no phase, fixture, zone or weed wants gets
    // a Baker's wheat (+1% CpS each while mature). Runs last, so it only ever
    // uses truly idle ground (e.g. lane 2 during the half-day elderwort
    // maturation) and is evicted the moment a real phase claims the tile.
    // Skipped during weed season, where empty tiles ARE the resource.
    if (!plan.weedActive && gardenUnlocked("bakerWheat")) {
        for (var cy = 0; cy < 6; cy++) {
            for (var cx = 0; cx < 6; cx++) {
                if (plan.claims[cx + "," + cy]) continue;
                var ct = G.plot[cy][cx];
                if (ct[0] && !G.plantsById[ct[0] - 1].unlocked) continue; // protected sprout
                claim(cx, cy, "plant", "bakerWheat", "cps-backfill");
            }
        }
    }

    return plan;
}

// True if a contaminating plant at (x,y) would endanger a protected sprout:
// an orthogonally adjacent locked plant that isn't itself contamination-immune
// (crumbspore/doughshroom have noContam). The sprout is the goal and the
// parent is replaceable, so such tiles are kept contaminator-free until the
// sprout is harvested.
function gardenContamRisk(x, y) {
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < dirs.length; i++) {
        var nx = x + dirs[i][0];
        var ny = y + dirs[i][1];
        if (nx < 0 || nx > 5 || ny < 0 || ny > 5) continue;
        var t = G.plot[ny][nx];
        if (!t[0]) continue;
        var p = G.plantsById[t[0] - 1];
        if (!p.unlocked && p.key !== "crumbspore" && p.key !== "doughshroom") return true;
    }
    return false;
}

// A meddleweed may be farmed (kept until age 84 for its seed drops) if the P3
// weed hunt is on, the plan doesn't want its tile planted, and nothing
// contaminable sits or is about to be planted next to it (5%/tick contamination
// would endanger parents, the cronerice trio and growing sprouts). Everywhere
// else weeds are removed on sight.
function gardenWeedFarmable(plan, x, y) {
    if (!plan.weedActive) return false;
    var cur = plan.claims[x + "," + y];
    if (cur && cur.kind === "plant" && cur.key !== "meddleweed") return false;
    return gardenNeighbors(x, y).every(function (c) {
        var t = G.plot[c.y][c.x];
        if (t[0] && G.plantsById[t[0] - 1].key !== "meddleweed") return false;
        var nc = plan.claims[c.x + "," + c.y];
        return !(nc && nc.kind === "plant" && nc.key !== "meddleweed");
    });
}

// Board processing, run once right after each garden tick.
function gardenCleanupPass(plan) {
    for (var y = 0; y < 6; y++) {
        for (var x = 0; x < 6; x++) {
            var tile = G.plot[y][x];
            if (!tile[0]) continue;
            var plant = G.plantsById[tile[0] - 1];
            var age = tile[1];
            var cur = plan.claims[x + "," + y];

            // Juicy queenbeet: never removed; a natural death gives no lump, so
            // harvest as soon as it matures (85-99 window).
            if (plant.key === "queenbeetLump") {
                if (age >= plant.mature) {
                    G.harvest(x, y);
                    Game.Notify("Garden: Juicy queenbeet harvested", "+1 sugar lump");
                    gardenLog("harvest", "queenbeetLump @" + x + "," + y);
                }
                continue;
            }

            // Meddleweed: farm it wherever it's safe during P3, remove it on
            // sight anywhere else. Harvesting a mature one still rolls the
            // seed drops either way.
            if (plant.key === "meddleweed") {
                if (gardenWeedFarmable(plan, x, y)) {
                    if (age >= GARDEN_MEDDLEWEED_HARVEST_AGE) {
                        G.harvest(x, y);
                        gardenLog("harvest", "meddleweed @" + x + "," + y + " (age " + Math.floor(age) + ")");
                    }
                } else {
                    G.harvest(x, y);
                    gardenLog("weed", "removed meddleweed @" + x + "," + y);
                }
                continue;
            }

            // Seeds we don't own yet: let them mature, then harvest to unlock
            if (!plant.unlocked) {
                if (plan.thinDup[x + "," + y]) {
                    G.harvest(x, y);
                    gardenLog("thin", "duplicate " + plant.key + " sprout @" + x + "," + y + " (frees a JQB hole)");
                    continue;
                }
                if (age >= plant.mature) {
                    G.harvest(x, y);
                    gardenLog("harvest", plant.key + " @" + x + "," + y + " (new seed)");
                }
                continue;
            }

            // A planted contaminator sitting next to a protected sprout
            // would eat it at 3%/tick: pull the parent until the sprout is
            // harvested (it gets replanted automatically afterwards)
            if ((plant.key === "crumbspore" || plant.key === "doughshroom") && gardenContamRisk(x, y)) {
                G.harvest(x, y);
                gardenLog("thin", plant.key + " @" + x + "," + y + " (protecting an adjacent sprout)");
                continue;
            }

            // Grid generation management: full reset once most of the cohort
            // is gone, plus culling of individual beets too far out of phase
            // to ever share the cohort's mature window. In retirement (JQB
            // growing, duketater/shriekbulb secured) each beet is instead
            // harvested at maturity for its yield and never replanted.
            if (plant.key === "queenbeet" && cur && cur.phase === "P16-grid") {
                if (plan.gridRetire) {
                    if (age >= plant.mature) {
                        G.harvest(x, y);
                        gardenLog("harvest", "retiring queenbeet @" + x + "," + y);
                    }
                    continue;
                }
                var outOfPhase = plan.gridMedian != null && Math.abs(age - plan.gridMedian) > 20;
                if (plan.gridCull || outOfPhase) {
                    G.harvest(x, y);
                    gardenLog("thin", "queenbeet generation " + (plan.gridCull ? "reset" : "outlier") + " @" + x + "," + y);
                    continue;
                }
            }

            // Everything else survives only where the plan wants that species
            if (cur && cur.kind === "plant" && cur.key === plant.key) continue;
            G.harvest(x, y);
            gardenLog("thin", plant.key + " @" + x + "," + y);
        }
    }
}

// Seed prices scale with the current CpS, so only CpS-boosting buffs (Frenzy,
// building specials...) inflate them. Debuffs like Clot or Cursed Finger make
// seeds cheaper and click buffs don't affect the price at all, so those don't
// block planting.
function gardenBuffedPrices() {
    return Object.keys(Game.buffs).some(function (name) {
        var buff = Game.buffs[name];
        return buff && buff.multCpS > 1;
    });
}

// Plant whatever the plan wants into empty tiles. Runs every pass (planting is
// allowed at any time), but never while a buff inflates plant prices.
function gardenPlantPass(plan) {
    if (gardenBuffedPrices()) return;
    var planted = false;
    Object.keys(plan.claims).forEach(function (id) {
        var c = plan.claims[id];
        if (c.kind !== "plant") return;
        if (plan.deferred[id]) return;
        var xy = id.split(",");
        var x = Number(xy[0]);
        var y = Number(xy[1]);
        if (G.plot[y][x][0]) return;
        var plant = G.plants[c.key];
        if (!plant || !plant.unlocked || plant.plantable === false) return;
        if ((c.key === "crumbspore" || c.key === "doughshroom") && gardenContamRisk(x, y)) return;
        if (!G.canPlant(plant)) return;
        G.seedSelected = plant.id;
        G.clickTile(x, y);
        if (G.plot[y][x][0]) {
            planted = true;
            gardenLog("plant", c.key + " @" + x + "," + y);
        }
    });
    if (planted) G.seedSelected = -1;
}

// Fertilizer (fast ticks) while parents grow or a JQB ages; wood chips (x3
// mutation rate) once every active parent is mature. P3 pins fertilizer since
// wood chips would suppress weeds by 90%.
function gardenSoilPass(plan) {
    var want = GARDEN_SOIL_FERTILIZER;
    if (!plan.weedActive && !plan.jqb && plan.active.length) {
        // A slow locked sprout (elderwort/everdaisy/drowsyfern class, 100+
        // ticks to mature) is almost always the cycle's gating chain: keep
        // the fast fertilizer ticks for it. The grid runs its own economy.
        var slowSprout = false;
        if (!plan.gridActive) {
            for (var sy = 0; sy < 6 && !slowSprout; sy++) {
                for (var sx = 0; sx < 6; sx++) {
                    var st = G.plot[sy][sx];
                    if (!st[0]) continue;
                    var sp = G.plantsById[st[0] - 1];
                    if (sp.unlocked) continue;
                    if (sp.mature / (sp.ageTick + sp.ageTickR / 2) > 100) {
                        slowSprout = true;
                        break;
                    }
                }
            }
        }
        // Wood chips (x3 mutations, 5 min ticks) beat fertilizer as soon as
        // ANY recipe is actually rolling: the roller gains x1.8 real-time,
        // which outweighs the x1.67 growth slowdown of phases still maturing
        // alongside. "Rolling" = every species of the recipe has at least one
        // mature planted specimen (so held gaps or a squatted tile don't
        // disqualify a working recipe, but a missing partner does).
        var anyRolling = plan.active.some(function (entry) {
            if (entry.phase.aux || !entry.cells.length) return false;
            var okBySpecies = {};
            entry.cells.forEach(function (c) {
                var tile = G.plot[c.y][c.x];
                var plant = G.plants[c.key];
                if (!(c.key in okBySpecies)) okBySpecies[c.key] = false;
                if (tile[0] - 1 === plant.id && tile[1] >= plant.mature) {
                    okBySpecies[c.key] = true;
                }
            });
            return Object.keys(okBySpecies).every(function (k) {
                return okBySpecies[k];
            });
        });
        if (!slowSprout && anyRolling) want = GARDEN_SOIL_WOODCHIPS;
    }
    if (G.soil === want) return;
    if (Date.now() < G.nextSoil) return;
    var soil = G.soilsById[want];
    if (!soil) return;
    // Soils unlock by lifetime harvest count (fertilizer at 50, wood chips at 300)
    if (typeof G.harvestsTotal === "number" && G.harvestsTotal < (soil.req || 0)) return;
    // There is no askSoil API. Prefer clicking the real soil button so the
    // vanilla handler updates both the state and the UI highlight; fall back
    // to assigning the fields directly (what the handler does) if the garden
    // DOM hasn't been built yet.
    var soilButton = typeof l === "function" ? l("gardenSoil-" + want) : null;
    if (soilButton) {
        soilButton.click();
        if (G.soil !== want) return; // refused (e.g. a prompt); retry next pass
    } else {
        G.soil = want;
        G.nextSoil = Date.now() + 1000 * 60 * 10;
        G.toRebuild = true;
        Game.recalculateGains = 1;
    }
    gardenLog("soil", soil.name);
}

function gardenSacrifice() {
    if (typeof G.askConvert !== "function") return;
    G.askConvert();
    Game.ConfirmPrompt();
    if (G.plantsUnlockedN <= 1) {
        Game.Notify("Garden sacrificed", "All seeds were unlocked: +10 sugar lumps. Restarting from Baker's wheat.");
        gardenLog("sacrifice", "+10 sugar lumps, loop restarts");
        FrozenCookies.gardenLastStep = -1;
    }
}

function autoGarden() {
    if (window.gardenBotEnabled === false) return;
    if (!G) G = Game.Objects["Farm"].minigame;
    if (!G || !G.plot || !G.plants) return;
    if (Game.OnAscend || G.freeze) return;

    gardenNoticeUnlocks();
    var plan = gardenBuildPlan();
    var total = G.plantsN || 34;

    // P17: everything unlocked (and no JQB left to harvest)
    if (G.plantsUnlockedN >= total && !plan.jqb) {
        if (FrozenCookies.autoGarden == 2) {
            if (!FrozenCookies.gardenNotified34) {
                FrozenCookies.gardenNotified34 = 1;
                Game.Notify(
                    "Garden: all " + total + " seeds unlocked",
                    "Auto Garden is in verify mode; sacrifice the garden yourself or switch to full loop."
                );
                gardenLog("complete", "all seeds unlocked, waiting (verify mode)");
            }
        } else {
            gardenSacrifice();
        }
        return;
    }
    FrozenCookies.gardenNotified34 = 0;

    // Harvesting/thinning decisions only once per garden tick
    if (FrozenCookies.gardenLastStep !== G.nextStep) {
        FrozenCookies.gardenLastStep = G.nextStep;
        gardenCleanupPass(plan);
    }

    gardenPlantPass(plan);
    gardenSoilPass(plan);
}

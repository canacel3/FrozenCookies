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

// Seeds that only the P15 queenbeet grid can produce
var GARDEN_LATE_SEEDS = {
    queenbeetLump: 1,
    duketater: 1,
    shriekbulb: 1,
};

// The grid-gating recipes that use cronerice as a parent; the trio at
// (0,4),(2,4),(4,4) stays planted until these are secured, then hands lane 2
// to P11b. wardlichen also uses cronerice but no longer holds the trio: it
// is a strip seed, and S-wardlichen grows its own cronerice on row 5.
var GARDEN_CRONERICE_USERS = ["gildmillet", "elderwort"];

// Seeds whose recipes still fit on row 5 while the queenbeet grid holds the
// inner 5x5: one or two mature parents visible from an in-row gap, and no
// contaminating parent (mushrooms would eat the prize sprout orthogonally;
// everdaisy needs 3+3 and goldenClover clover x4 - geometrically impossible
// on a single row). The grid does NOT wait for these: they are hunted on
// the row-5 strip while the JQB lottery runs. Array order in gardenPhases =
// hunt priority: the drowsyfern chain first (its sprout matures for ~285
// ticks, so it must start rolling as early as possible), then the
// whiskerbloom line, then wardlichen.
var GARDEN_STRIP_SEEDS = ["keenmoss", "drowsyfern", "whiskerbloom", "nursetulip", "chimerose", "wardlichen"];

// Every fungus-species hunt target (fungus mutations are suppressed to zero
// inside a tidygrass/everdaisy aura, so the everdaisy rig must not go up
// while any of these is still open). The strip seeds are all non-fungus,
// so the row-5 hunts are never affected.
var GARDEN_FUNGUS_TARGETS = ["whiteMildew", "greenRot", "wrinklegill",
    "glovemorel", "cheapcap", "doughshroom", "foolBolete", "ichorpuff"];

// L-shaped strip along the grid border: both arms read A,gap,B,A,gap,B -
// row 5 left-to-right and column 5 top-to-bottom, sharing the corner
// (5,5) as the column's final B. Every gap sees one A and one B (or two
// of the species when a === b), 4 roll tiles total - double the old
// row-only form. The cost is duketater roll sites during beet mature
// windows: 8 (4 holes + 4 strip gaps, all of which touch inner beets)
// instead of 11 with an empty column, still ~30%/window - comfortably
// ahead of the JQB.
function gardenStripCells(a, b) {
    return [
        { key: a, x: 0, y: 5 }, { key: b, x: 2, y: 5 },
        { key: a, x: 3, y: 5 }, { key: b, x: 5, y: 5 },
        { key: a, x: 5, y: 0 }, { key: b, x: 5, y: 2 },
        { key: a, x: 5, y: 3 },
    ];
}
function gardenStripZone() {
    return [{ x: 1, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 1 }, { x: 5, y: 4 }];
}

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

// Golden clover wiki layout (0-indexed), full 6-row version: by the time P14
// runs, the elderwort shelf has retired (its consumers ichorpuff/everdaisy
// are prerequisites of reaching P14), so the bottom row is free again.
var GARDEN_P14_PLOTS = [
    [0, 0], [1, 0], [3, 0], [5, 0],
    [1, 1], [3, 1], [5, 1],
    [0, 2], [3, 2], [5, 2],
    [0, 3], [2, 3], [5, 3],
    [0, 4], [2, 4], [4, 4],
    [0, 5], [2, 5], [4, 5], [5, 5],
];

function gardenP14Cells() {
    return GARDEN_P14_PLOTS.map(function (c) {
        return { key: "clover", x: c[0], y: c[1] };
    });
}

function gardenP14Zone() {
    var used = {};
    GARDEN_P14_PLOTS.forEach(function (c) {
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
// The P15 queenbeet grid is handled separately in gardenBuildPlan().
var gardenPhases = [
    { id: "P1", targets: ["thumbcorn"], rollNeeds: { bakerWheat: 2 },
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
    // Established goldenClover field: once the synchronized 20-clover
    // cohort is planted (by the P14 entry further down, in the queenbeet
    // sprout window), it holds the whole board against later-reviving
    // hunts until goldenClover sprouts - nibbling tiles from the cohort
    // breaks both the generation sync and the site cluster (a mushroom
    // hunt reviving mid-field once tore out the entire crop). This early
    // twin only activates while clovers stand on the plots; the moment
    // the sprout appears both entries complete and the board hands over
    // to foolBolete & co.
    { id: "P14", targets: ["goldenClover"], rollNeeds: { clover: 4 }, syncSpecies: "clover",
        when: function () {
            return !!FrozenCookies.gardenCloverHold;
        },
        cells: gardenP14Cells(),
        zone: gardenP14Zone() },
    { id: "P10-1", targets: ["greenRot"],
        cells: gardenRow("whiteMildew", 1, GARDEN_X_EVEN).concat(gardenRow("clover", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    // Contamination-splitting layout: the mushroom keeps even spacing on row
    // 0, the partner sits on row 2 (two rows apart: no orthogonal contact),
    // and the shared mutation row y=1 between them touches both species.
    // Staying inside rows 0-2 leaves lane 2 (rows 3-5) free, so these run in
    // parallel with P9/P11b instead of conflicting with their zones.
    { id: "P10-2", targets: ["wrinklegill"],
        cells: gardenRow("crumbspore", 0, GARDEN_X_EVEN).concat(gardenRow("brownMold", 2, GARDEN_X_EVEN)),
        zone: gardenZoneRows([1], GARDEN_X_ALL) },
    { id: "P10-3", targets: ["glovemorel"],
        cells: gardenRow("crumbspore", 0, GARDEN_X_EVEN).concat(gardenRow("thumbcorn", 2, GARDEN_X_EVEN)),
        zone: gardenZoneRows([1], GARDEN_X_ALL) },
    { id: "P10-4", targets: ["cheapcap"],
        cells: gardenRow("crumbspore", 0, GARDEN_X_EVEN).concat(gardenRow("shimmerlily", 2, GARDEN_X_EVEN)),
        zone: gardenZoneRows([1], GARDEN_X_ALL) },
    // doughshroom needs crumbspore M x2 at once -> keep the generation in sync
    { id: "P10-5", targets: ["doughshroom"], syncSpecies: "crumbspore", rollNeeds: { crumbspore: 2 },
        cells: gardenRow("crumbspore", 1, GARDEN_X_EVEN),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P10-6", targets: ["foolBolete"],
        cells: gardenRow("doughshroom", 0, GARDEN_X_EVEN).concat(gardenRow("greenRot", 2, GARDEN_X_EVEN)),
        zone: gardenZoneRows([1], GARDEN_X_ALL) },
    // tidygrass is 0.2%, so run the same recipe on both lanes when lane 2 is free
    { id: "P11a", targets: ["tidygrass"],
        cells: gardenRow("bakerWheat", 1, GARDEN_X_EVEN).concat(gardenRow("whiteChocoroot", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P11b", targets: ["tidygrass"],
        cells: gardenRow("bakerWheat", 4, GARDEN_X_EVEN).concat(gardenRow("whiteChocoroot", 4, GARDEN_X_ODD)),
        zone: gardenZoneRows([3, 5], GARDEN_X_ALL) },
    // The elderwort shelf cells are listed as parents so the soil logic waits
    // for them to mature before switching to wood chips.
    { id: "P12", targets: ["ichorpuff"],
        cells: gardenRow("crumbspore", 3, [1, 3, 5]).concat(gardenRow("elderwort", 5, GARDEN_X_ALL)),
        zone: gardenZoneRows([4], GARDEN_X_ALL) },
    // Tidygrass zeroes plotBoost[2] (the weed/fungus repellent value) in a
    // 5x5 aura, even while still growing - and fungus MUTATIONS roll
    // against that value, so a tidygrass row on y=3 makes every fungus
    // hunt on rows 1-5 impossible (this silently stalled a doughshroom
    // hunt for a full day). The everdaisy rig therefore waits until every
    // fungus-species target is secured; fungus hunts are fast when
    // unsuppressed, and this also keeps the later everdaisy sprout's own
    // 3x3 aura harmless.
    { id: "P13", targets: ["everdaisy"], requireHave: GARDEN_FUNGUS_TARGETS,
        cells: gardenRow("tidygrass", 3, GARDEN_X_ALL).concat(gardenRow("elderwort", 5, GARDEN_X_ALL)),
        zone: gardenZoneRows([4], [1, 2, 3, 4]) },
    { id: "P15a", targets: ["queenbeet"],
        cells: gardenRow("bakeberry", 1, GARDEN_X_EVEN).concat(gardenRow("chocoroot", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    // Evaluated after P15a on purpose: the queenbeet hunt is a short, already
    // -invested sprint whose sprout then frees the whole board for ~67 ticks
    // - almost exactly goldenClover's expected hunt time - so P14 slots into
    // that window instead of evicting a growing bakeberry row.
    // goldenClover needs clover M x4 AT ONCE: desynced cells are mature-4
    // only ~20% of the time (0.67^4) vs ~67% for a locked generation, so the
    // field replants in lockstep like the other same-species recipes.
    { id: "P14", targets: ["goldenClover"], rollNeeds: { clover: 4 }, syncSpecies: "clover",
        cells: gardenP14Cells(),
        zone: gardenP14Zone() },
    // Everdaisy booster: with queenbeet secured, lane 1 has nothing left to
    // hunt until everdaisy lands, so grow a second elderwort row on y=1.
    // Once mature, (1,2)-(4,2) see 3 elderwort above + 3 tidygrass below,
    // doubling the everdaisy mutation cells. `aux` keeps this slow row (8h+)
    // out of the soil-maturity gate so it can't delay the wood chips switch.
    // With this elderwort row in place, row 2 becomes a bonus mutation row.
    // Its corners can only ever fire for ichorpuff (elder x1 + crumb x1);
    // everdaisy needs 3+3 which corners can't see, so once ichorpuff is
    // secured they're released to the CpS backfill.
    { id: "P13b", targets: ["everdaisy"], aux: true, requireHave: ["queenbeet"],
        cells: gardenRow("elderwort", 1, GARDEN_X_ALL),
        zone: function (have) {
            return have("ichorpuff")
                ? gardenZoneRows([2], [1, 2, 3, 4])
                : gardenZoneRows([2], GARDEN_X_ALL);
        } },
    // Strip-seed normal phases, demoted to the lowest hunt priority: none
    // of these six seeds gates the grid start anymore (they finish on the
    // row-5 strip during the JQB lottery), so pre-grid they only get lanes
    // that no grid-gating hunt wants. Same relative order as the strip:
    // the slow-sprouting drowsyfern chain first.
    { id: "P16-1", targets: ["keenmoss"],
        cells: gardenRow("greenRot", 1, GARDEN_X_EVEN).concat(gardenRow("brownMold", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P16-2", targets: ["drowsyfern"],
        cells: gardenRow("chocoroot", 1, GARDEN_X_EVEN).concat(gardenRow("keenmoss", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P16-3", targets: ["whiskerbloom"],
        cells: gardenRow("shimmerlily", 1, GARDEN_X_EVEN).concat(gardenRow("whiteChocoroot", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    // Lane-2 duplicate (same pattern as P2b/P11b): keeps the whiskerbloom
    // hunt rolling when lane 1 is lent to a mushroom phase, and doubles it
    // when both lanes are free.
    { id: "P16-3b", targets: ["whiskerbloom"],
        cells: gardenRow("shimmerlily", 4, GARDEN_X_EVEN).concat(gardenRow("whiteChocoroot", 4, GARDEN_X_ODD)),
        zone: gardenZoneRows([3, 5], GARDEN_X_ALL) },
    // nursetulip needs whiskerbloom M x2 at once -> keep the generation in sync
    { id: "P16-4", targets: ["nursetulip"], syncSpecies: "whiskerbloom", rollNeeds: { whiskerbloom: 2 },
        cells: gardenRow("whiskerbloom", 1, GARDEN_X_ALL),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P16-5", targets: ["chimerose"],
        cells: gardenRow("shimmerlily", 1, GARDEN_X_EVEN).concat(gardenRow("whiskerbloom", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P16-6", targets: ["wardlichen"],
        cells: gardenRow("cronerice", 4, GARDEN_X_EVEN).concat(gardenRow("whiteMildew", 4, GARDEN_X_ODD)),
        zone: gardenZoneRows([3, 5], GARDEN_X_ALL) },
    // Strip phases: row-5 hunts for GARDEN_STRIP_SEEDS while the grid holds
    // the inner 5x5 (strip: true = only active during gridActive; before the
    // grid these seeds are hunted by their normal phases above). One at a
    // time: the first incomplete one claims row 5, the rest wait.
    { id: "S-keenmoss", targets: ["keenmoss"], strip: true,
        cells: gardenStripCells("greenRot", "brownMold"), zone: gardenStripZone() },
    { id: "S-drowsyfern", targets: ["drowsyfern"], strip: true,
        cells: gardenStripCells("chocoroot", "keenmoss"), zone: gardenStripZone() },
    { id: "S-whiskerbloom", targets: ["whiskerbloom"], strip: true,
        cells: gardenStripCells("shimmerlily", "whiteChocoroot"), zone: gardenStripZone() },
    { id: "S-nursetulip", targets: ["nursetulip"], strip: true,
        cells: gardenStripCells("whiskerbloom", "whiskerbloom"), zone: gardenStripZone() },
    { id: "S-chimerose", targets: ["chimerose"], strip: true,
        cells: gardenStripCells("shimmerlily", "whiskerbloom"), zone: gardenStripZone() },
    { id: "S-wardlichen", targets: ["wardlichen"], strip: true,
        cells: gardenStripCells("cronerice", "whiteMildew"), zone: gardenStripZone() },
    // Background wheat lanes: bakeberry is only 0.1%, so keep wheat in any free
    // lane tiles from P1 all the way until it finally unlocks.
    { id: "fillerL1", targets: ["bakeberry"], partial: true, rollNeeds: { bakerWheat: 2 },
        cells: gardenRow("bakerWheat", 1, GARDEN_X_LEFT),
        zone: gardenZoneRows([0, 2], GARDEN_X_LEFT) },
    // While the cronerice trio can't exist (cronerice still locked, cycle
    // start) or once it has retired (all three of its recipes secured),
    // lane 2 belongs to bakeberry outright: a full wheat row 4 turns all 12
    // cells of rows 3/5 into mutation slots - double the comb's count for
    // the same recipe. The comb below takes over only for the trio's actual
    // residency (its own wheat columns on rows 3/5 survive cronerice taking
    // the even row-4 tiles). Declared before the comb version; its zone
    // claims keep the comb from wheating the mutation rows.
    { id: "fillerL2-open", targets: ["bakeberry"], partial: true, rollNeeds: { bakerWheat: 2 },
        when: function (have) {
            return !gardenUnlocked("cronerice") || GARDEN_CRONERICE_USERS.every(have);
        },
        cells: gardenRow("bakerWheat", 4, GARDEN_X_ALL),
        zone: gardenZoneRows([3, 5], GARDEN_X_ALL) },
    // With the cronerice trio still holding the even row-4 cells, wheat on
    // rows 3/5 (even x) turns the odd cells of those rows into bakeberry
    // mutation slots: 6 eligible cells instead of 4. Partial, so any real
    // phase that needs these rows takes priority automatically.
    { id: "fillerL2", targets: ["bakeberry"], partial: true, rollNeeds: { bakerWheat: 2 },
        cells: gardenRow("bakerWheat", 4, [0, 1, 2, 3, 5])
            .concat(gardenRow("bakerWheat", 3, GARDEN_X_EVEN))
            .concat(gardenRow("bakerWheat", 5, GARDEN_X_EVEN)),
        zone: gardenZoneRows([3, 5], GARDEN_X_ALL) },
];

// Lane-1 layouts (standard forms and the y0-2 contamination-split forms) may
// relocate +3 rows onto lane 2 when their home tiles are claimed by another
// phase or squatted by a protected sprout.
gardenPhases.forEach(function (p) {
    if (["P1", "P2", "P4", "P5", "P7", "P8", "P10-1", "P16-1", "P10-2", "P10-3",
        "P10-4", "P10-5", "P10-6", "P16-2", "P16-3", "P16-4", "P16-5", "P11a",
        "P15a"].indexOf(p.id) !== -1) {
        p.shiftable = true;
    }
});

// Species a GRID-GATING phase plants as a parent. A locked sprout of one
// of these gates further construction (its unlock is what lets the next
// recipe get built), so the soil logic keeps fertilizer's fast ticks for
// it. Leaf species (everdaisy, foolBolete, duketater...) don't pin, and
// neither do parents used ONLY by the postponed strip seeds (whiskerbloom,
// keenmoss...): those hunts overlap the JQB lottery and gate nothing, so
// the rolling hunts' wood chips win. queenbeet is added by hand: the JQB
// grid plants it outside the phase table.
var GARDEN_PARENT_SPECIES = { queenbeet: true };
gardenPhases.forEach(function (p) {
    var stripOnly = (p.targets || []).length && p.targets.every(function (t) {
        return GARDEN_STRIP_SEEDS.indexOf(t) !== -1;
    });
    if (stripOnly) return;
    (p.cells || []).forEach(function (c) { GARDEN_PARENT_SPECIES[c.key] = true; });
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
        syncCull: {}, // "x,y" -> true: stranded sync-generation survivor, harvest now
        syncHold: {}, // "x,y" -> true: sync-generation gap; skip planting but DON'T lend the zone
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
    // sprouted): the 21 queenbeets can grow out while e.g. the everdaisy
    // sprout finishes its ~250-tick maturation, saving half a day per cycle.
    // Strip seeds don't gate the start either - their hunts continue on the
    // row-5 strip while the JQB lottery runs (the whole point: the spawn
    // wait is the cycle's longest pole, so everything that CAN overlap it
    // does). Queenbeet itself must be truly unlocked (it has to be
    // plantable) and the sacrifice gate stays strictly unlock-based.
    var preComplete = gardenUnlocked("queenbeet") && Object.keys(G.plants).every(function (key) {
        return GARDEN_LATE_SEEDS[key] || GARDEN_STRIP_SEEDS.indexOf(key) !== -1 || have(key);
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
    // (P12 ichorpuff, P13 everdaisy) are still open; retiring it afterwards
    // frees the bottom row for P14's full clover layout.
    var shelfDone = have("ichorpuff") && have("everdaisy");
    if (gardenUnlocked("elderwort") && !shelfDone && !plan.gridActive) {
        GARDEN_X_ALL.forEach(function (x) {
            claim(x, 5, "plant", "elderwort", "shelf");
        });
    }

    // Sticky hold for an established goldenClover field (see the early P14
    // twin in the phase table): 10+ clovers on the plots arm it, the
    // golden sprout/unlock (or the post-sacrifice reset) disarm it. The
    // threshold ignores stray clovers from earlier hunts (P10-1 plants 3
    // on plot tiles), and stickiness keeps the hold alive through the
    // brief all-dead gap when a synchronized generation dies and replants.
    if (have("goldenClover") || !gardenUnlocked("clover")) {
        FrozenCookies.gardenCloverHold = false;
    } else {
        var cloverId = G.plants.clover.id;
        var cloverOnPlots = 0;
        GARDEN_P14_PLOTS.forEach(function (c) {
            if (G.plot[c[1]][c[0]][0] - 1 === cloverId) cloverOnPlots++;
        });
        if (cloverOnPlots >= 10) FrozenCookies.gardenCloverHold = true;
    }

    // Fixture: cronerice trio, planted in P2 and kept while any recipe that
    // needs it is still open (regrowing it later would cost 74 ticks). Once
    // the grid owns row 4, S-wardlichen grows its own cronerice on the strip.
    var cronericeDone = GARDEN_CRONERICE_USERS.every(have);
    if (gardenUnlocked("cronerice") && !cronericeDone && !plan.gridActive) {
        GARDEN_X_EVEN.forEach(function (x) {
            claim(x, 4, "plant", "cronerice", "trio");
        });
    }

    if (plan.gridActive) {
        if (plan.jqb) {
            // Protect the JQB tile itself
            claim(plan.jqb.x, plan.jqb.y, "plant", "queenbeetLump", "P15-jqb");
            // Refill tiles where a neighboring queenbeet died with elderwort:
            // each one ages the JQB 3% faster. Living queenbeets are left alone.
            if (gardenUnlocked("elderwort")) {
                gardenNeighbors(plan.jqb.x, plan.jqb.y).forEach(function (c) {
                    var t = G.plot[c.y][c.x];
                    if (t[0] === 0 || G.plantsById[t[0] - 1].key === "elderwort") {
                        claim(c.x, c.y, "plant", "elderwort", "P15-ring");
                    }
                });
            }
        }
        // P15c: while a JQB grows, shriekbulb is hunted via duketater x3 at
        // ANY age (0.5% - five times the queenbeet M x5 holes, and with no
        // maturation wait): a duketater row on the edge farthest from the
        // JQB, with the neighboring row kept open as the roll pocket (its
        // middle four tiles each see three duketaters). Only while the JQB
        // grows - before that, the queenbeet grid must stay intact for the
        // JQB holes themselves.
        if (plan.jqb && gardenUnlocked("duketater") && !have("shriekbulb")) {
            var dRow = plan.jqb.y >= 3 ? 0 : 5;
            var pRow = dRow === 0 ? 1 : 4;
            for (var dx2 = 0; dx2 < 6; dx2++) {
                claim(dx2, dRow, "plant", "duketater", "P15c");
                claim(dx2, pRow, "zone", null, "P15c");
            }
        }
        // Retirement: once a JQB is growing and duketater is secured, the
        // rest of the grid has nothing left to produce (the elderwort ring
        // shares tiles with every other JQB hole, the side holes only roll
        // junk, and shriekbulb is hunted via the P15c duketater row instead).
        // Stop replanting queenbeets; each remaining one is harvested at
        // maturity for its yield, and every freed tile (holes included) grows
        // Baker's wheat for its +1% CpS passive.
        plan.gridRetire = !!plan.jqb && have("duketater");

        // Border: JQB needs 8 mature queenbeet neighbors, so a hole on the
        // x=5/y=5 border (5 neighbors, 3 in the corner) can never roll it -
        // only the four inner holes (1,1),(3,1),(1,3),(3,3) live, and they
        // draw all their neighbors from the inner 5x5. So the border NEVER
        // grows queenbeets (21, not 27): while duketater/shriekbulb are
        // still missing, the empty border tiles next to the inner beets are
        // free extra duketater roll sites (M x2 reaches them; ~14 sites vs
        // the old 9 holes); row 5 doubles as the strip-hunt lane. Once both
        // are secured and no strip hunt remains, the border becomes Baker's
        // wheat (+11% CpS for the days-long JQB wait).
        var gridLate = have("duketater") && have("shriekbulb");
        plan.gridLate = gridLate;
        var stripOpen = GARDEN_STRIP_SEEDS.some(function (k) { return !have(k); });
        // Queenbeet grid: plant the inner 5x5 except the 4 hole tiles.
        var gridCells = [];
        var qbId = G.plants["queenbeet"].id;
        for (var gy = 0; gy < 6; gy++) {
            for (var gx = 0; gx < 6; gx++) {
                // Retirement: the grid stops claiming ground it doesn't
                // need (only the JQB, its ring, P15c and the still-living
                // beets stay claimed). ~25 tiles fall to the ordinary
                // phase loop, so any remaining postponed hunts (P16-x)
                // build FULL-WIDTH rigs there during the day-long JQB
                // maturation - far faster than the 2-gap strip - and the
                // final CpS backfill wheats whatever they don't take.
                if (plan.gridRetire) {
                    if (plan.claims[gx + "," + gy]) continue;
                    if (G.plot[gy][gx][0] - 1 === qbId) {
                        claim(gx, gy, "plant", "queenbeet", "P15-grid");
                        gridCells.push({ key: "queenbeet", x: gx, y: gy });
                    }
                    continue;
                }
                if (gx === 5 || gy === 5) {
                    if (plan.claims[gx + "," + gy]) continue; // P15c row / JQB ring
                    if (stripOpen || !gridLate) {
                        // The L-shaped strip claims its border cells in the
                        // phase loop; the rest stays open as duketater roll
                        // sites (the backfill skips the border, so no claim
                        // is needed to protect them).
                        continue;
                    }
                    if (gardenUnlocked("bakerWheat")) {
                        claim(gx, gy, "plant", "bakerWheat", "P15-cps");
                    }
                    continue;
                }
                if (gx % 2 === 1 && gy % 2 === 1) {
                    claim(gx, gy, "zone", null, "P15-grid");
                    continue;
                }
                if (plan.claims[gx + "," + gy]) continue; // JQB / ring
                claim(gx, gy, "plant", "queenbeet", "P15-grid");
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
        plan.active.push({ phase: { id: "P15-grid" }, cells: gridCells });
    }

    gardenPhases.forEach(function (phase) {
        if (phase.targets.every(have)) return; // done (unlocked or sprouted)
        if (phase.strip && !plan.gridActive) return; // strip forms only run beside the grid
        // During the spawn wait the grid owns rows 0-4 (only the strip runs
        // beside it); once it retires (JQB growing, duke secured) the board
        // opens up and the normal full-width forms hunt the leftovers.
        if (!phase.strip && plan.gridActive && !plan.gridRetire) return;
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
        if (phase.when && !phase.when(have)) return; // custom activation condition not met
        if (!phase.cells.every(function (c) { return gardenUnlocked(c.key); })) return; // parents not available yet
        var cells = phase.cells;
        // A zone may be a function of the current unlock state (e.g. P13b's
        // row-2 corners only matter while ichorpuff is still hunted)
        var zone = typeof phase.zone === "function" ? phase.zone(have) : (phase.zone || []);
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
                // Middle variant (row 3): once the elderwort shelf owns row
                // 5, the row-4 mirror is left with row 3 as its only live
                // mutation row. A single-row recipe can sit on row 3
                // instead, flanked by rows 2 AND 4 - row 2 is usually
                // lane 1's mutation row, but an empty tile rolls every
                // recipe its neighbors satisfy, so sharing costs nothing.
                // Contaminators are excluded: their prize sprouts would
                // land orthogonally adjacent to the parent row and get
                // overwritten (the split form keeps rolls diagonal-only).
                var midContam = cells.some(function (c) {
                    return c.key === "crumbspore" || c.key === "doughshroom";
                });
                if (!midContam && cells.every(function (c) { return c.y === 1; })) {
                    options.push({
                        cells: cells.map(function (c) { return { key: c.key, x: c.x, y: c.y + 2 }; }),
                        zone: zone.map(function (c) { return { x: c.x, y: c.y + 2 }; }),
                    });
                }
            }
            options = options.filter(function (o) { return o.cells.every(freeFor); });
            // A lane whose mutation zone is entirely dead is unusable: the
            // parents could be planted, but no tile could ever host the
            // mutation (e.g. P10-6 mirrored under a full P9 row 4 - and by
            // the time that row frees up, the elderwort shelf evicts the
            // rig). Hard-dead = the tile will hold an earlier phase's plant
            // or a protected locked sprout squats it: no reclaim path, veto
            // always. A live non-wheat plant (cleanup purges junk every
            // tick, so a persistent occupant is some LATER phase's rig,
            // invisible in the claims here) only vetoes NEW construction -
            // don't bulldoze a working hunt to build next to it. A rig this
            // phase already owns stays: its lazily-lent zone is reclaimed
            // from the borrower when the deferral lifts (the lending
            // contract), so the borrower's plants don't kill the lender.
            // Backfill wheat and another phase's *zone* claim never veto -
            // wheat yields the tile and shared empty mutation rows spawn
            // for both.
            var zoneDead = function (c, established) {
                var cl = plan.claims[c.x + "," + c.y];
                if (cl && (cl.kind === "plant" || cl.kind === "weed")) return true;
                var t = G.plot[c.y][c.x];
                if (!t[0]) return false;
                var p = G.plantsById[t[0] - 1];
                if (!p.unlocked) return true;
                return p.key !== "bakerWheat" && !established;
            };
            var optEstablished = function (o) {
                return o.cells.some(function (c) {
                    return c.key !== "bakerWheat" &&
                        G.plot[c.y][c.x][0] - 1 === G.plants[c.key].id;
                });
            };
            var zoneAlive = function (o) {
                var est = optEstablished(o);
                var n = 0;
                o.zone.forEach(function (c) {
                    if (!zoneDead(c, est)) n++;
                });
                return n;
            };
            options = options.filter(function (o) {
                return !o.zone.length || zoneAlive(o) > 0;
            });
            if (!options.length) return; // every lane is held or has no live mutation tile
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
            // Stickiness first: a lane already holding this phase's plants
            // wins, so the choice can't flap between passes (flapping plants
            // on both lanes: the plant pass runs every 5s but junk cleanup
            // only once per tick). Then territory avoidance, then handicaps.
            // Wheat doesn't count as an anchor (it's fungible backfill, not
            // an investment): when a rig's real parents die out as one
            // generation, the phase re-evaluates freely and can move to a
            // roomier lane (e.g. off the shelf-crippled row 4 onto row 3)
            // at that natural boundary instead of being pinned by leftover
            // wheat cells.
            var planted = function (o) {
                var n = 0;
                o.cells.forEach(function (c) {
                    if (c.key !== "bakerWheat" &&
                        G.plot[c.y][c.x][0] - 1 === G.plants[c.key].id) n++;
                });
                return n;
            };
            options.sort(function (a, b) {
                var d = planted(b) - planted(a);
                if (d) return d;
                // More live mutation tiles = more simultaneous rolls (e.g.
                // the middle variant's 12 vs the shelf-crippled mirror's 6).
                // Ranked below stickiness so an established hunt is never
                // yanked mid-growth, and above overlap so a shared-but-live
                // mutation row beats an exclusive-but-dead one.
                d = zoneAlive(b) - zoneAlive(a);
                if (d) return d;
                d = overlap(a) - overlap(b);
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
                // Same-species recipes live on their x-spacing: prefer the
                // sideways step that stays within pairing range (Chebyshev
                // <=2) of a sibling, so the dodged parent still shares roll
                // tiles. A crumbspore dodged from (4,1) to (5,1) pairs with
                // nothing; dodged to (3,1) it still pairs with (2,1).
                var sibs = origCells.filter(function (o) {
                    return o.key === c.key && (o.x !== c.x || o.y !== c.y);
                });
                if (sibs.length) {
                    var pairs = function (ax) {
                        return sibs.some(function (o) {
                            return Math.abs(o.x - ax) <= 2 && Math.abs(o.y - c.y) <= 2;
                        }) ? 0 : 1;
                    };
                    alts.sort(function (a, b) { return pairs(a) - pairs(b); });
                }
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
            // Per partner species the wait is until ANY ONE of its plants
            // within pairing range is mature - pairing range = Chebyshev
            // distance 2, the farthest two parents can sit while still
            // sharing a roll tile. A mature partner elsewhere in the row
            // doesn't help this cell (e.g. P16-6: mildew@1 next to a mature
            // cronerice@0 plants now, while mildew@3,@5 wait for their own
            // growing cronerice@2,@4 instead of dying uselessly in between).
            // The cell then waits for the slowest such species. No flat
            // floor: for extreme agers like greenRot (18.5 age/tick, ~5 tick
            // lifespan) even a 15-tick wait wastes several generations.
            var partnerBest = {};
            cells.forEach(function (o) {
                if (o.key === c.key) return;
                if (Math.abs(o.x - c.x) > 2 || Math.abs(o.y - c.y) > 2) return;
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
            var syncPlant = G.plants[phase.syncSpecies];
            var oldestSync = -1;
            var livingSync = 0;
            cells.forEach(function (c) {
                if (c.key !== phase.syncSpecies) return;
                var t = G.plot[c.y][c.x];
                if (t[0] - 1 === syncPlant.id) {
                    oldestSync = Math.max(oldestSync, t[1]);
                    livingSync++;
                }
            });
            // Hold gaps only once a late refill could no longer share the
            // cohort's mature window (joint maturity needs refillAge + mature
            // < 100): a plant that failed to land a few ticks late can still
            // join the generation, so refill it instead of running 5/6.
            if (oldestSync >= 0 && oldestSync > 100 - syncPlant.mature - 5) {
                var needSync = (phase.rollNeeds && phase.rollNeeds[phase.syncSpecies]) || 2;
                if (livingSync < needSync) {
                    // Fewer survivors than the recipe needs at once: this
                    // generation can never roll again, and refills can't
                    // join its window. Waiting for natural death is pure
                    // dead time - harvest the stragglers now so the whole
                    // group replants in lockstep next pass.
                    cells.forEach(function (c) {
                        if (c.key !== phase.syncSpecies) return;
                        var id = c.x + "," + c.y;
                        var t = G.plot[c.y][c.x];
                        if (t[0] - 1 === syncPlant.id) plan.syncCull[id] = true;
                        plan.deferred[id] = true;
                        plan.syncHold[id] = true;
                    });
                } else {
                    cells.forEach(function (c) {
                        if (c.key !== phase.syncSpecies) return;
                        if (!G.plot[c.y][c.x][0]) {
                            var gid = c.x + "," + c.y;
                            plan.deferred[gid] = true;
                            plan.syncHold[gid] = true;
                        }
                    });
                }
            }
        }
        // Lazy zones: while some of this phase's parents are still deferred
        // (waiting on a slow partner), no mutation can land anyway, so the
        // mutation rows stay unclaimed and a later phase or filler can keep
        // working there (e.g. the whiskerbloom hunt keeps rolling on row 1
        // while P10-6's doughshroom spends 42 ticks maturing). Once the
        // deferral lifts, the zone gets claimed and squatters are evicted
        // with a few ticks to spare before the rolls start. Sync-generation
        // holds do NOT lend: their window is a handful of ticks (or one
        // pass, for a stranded-survivor cull), so backfill wheat planted
        // there would be evicted before it ever matures - pure seed waste -
        // and while enough survivors still roll, the zone must stay open
        // anyway.
        var hasDeferred = cells.some(function (c) {
            var did = c.x + "," + c.y;
            return plan.deferred[did] && !plan.syncHold[did];
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
                // While duketater/shriekbulb are still hunted (and the grid
                // hasn't retired), unclaimed grid-border tiles are roll
                // sites, not idle ground.
                if (plan.gridActive && !plan.gridRetire && !plan.gridLate && (cx === 5 || cy === 5)) continue;
                var ct = G.plot[cy][cx];
                if (ct[0] && !G.plantsById[ct[0] - 1].unlocked) continue; // protected sprout
                claim(cx, cy, "plant", "bakerWheat", "cps-backfill");
            }
        }
    }

    return plan;
}

// Species vanilla marks noContam: contamination can never overwrite them.
// (Verified against minigameGarden.js - notably crumbspore/doughshroom are
// NOT immune; contam plants happily overwrite each other's sprouts.)
var GARDEN_CONTAM_IMMUNE = {
    elderwort: 1, queenbeet: 1, queenbeetLump: 1,
    duketater: 1, shriekbulb: 1, everdaisy: 1,
};

// True if a contaminating plant at (x,y) would endanger a protected sprout:
// an orthogonally adjacent locked plant that isn't contamination-immune.
// The sprout is the goal and the parent is replaceable, so such tiles are
// kept contaminator-free until the sprout is harvested.
function gardenContamRisk(x, y) {
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < dirs.length; i++) {
        var nx = x + dirs[i][0];
        var ny = y + dirs[i][1];
        if (nx < 0 || nx > 5 || ny < 0 || ny > 5) continue;
        var t = G.plot[ny][nx];
        if (!t[0]) continue;
        var p = G.plantsById[t[0] - 1];
        if (!p.unlocked && !GARDEN_CONTAM_IMMUNE[p.key]) return true;
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

            // Stranded sync-generation survivor (fewer left than the recipe
            // needs at once): harvest now instead of waiting out its death.
            if (plan.syncCull[x + "," + y] && plant.unlocked) {
                G.harvest(x, y);
                gardenLog("cull", plant.key + " @" + x + "," + y + " (stranded sync survivor)");
                continue;
            }

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
            if (plant.key === "queenbeet" && cur && cur.phase === "P15-grid") {
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
        // A locked sprout of a parent species (one that some phase plants as
        // a recipe ingredient: cronerice, elderwort, crumbspore, clover,
        // tidygrass, queenbeet...) gates further construction - its unlock
        // is what lets the next rig get built - so keep the fast fertilizer
        // ticks for it. Leaf sprouts (everdaisy, drowsyfern, duketater...)
        // only gate the final sacrifice, which waits for the JQB anyway -
        // the rolling hunts' x1.8 from wood chips wins for those.
        var slowSprout = false;
        if (!plan.gridActive) {
            for (var sy = 0; sy < 6 && !slowSprout; sy++) {
                for (var sx = 0; sx < 6; sx++) {
                    var st = G.plot[sy][sx];
                    if (!st[0]) continue;
                    var sp = G.plantsById[st[0] - 1];
                    if (!sp.unlocked && GARDEN_PARENT_SPECIES[sp.key]) {
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
        // "Rolling" = an actual roll site exists: an empty tile whose 8
        // neighbors simultaneously satisfy every species requirement of the
        // recipe (rollNeeds, default 1 per species). Four mature clovers
        // scattered across the field don't count until some empty tile sees
        // all four at once.
        var anyRolling = plan.active.some(function (entry) {
            // Strip hunts gate nothing (they overlap the JQB wait by
            // design), so they never justify wood chips: while the grid
            // generation grows, fertilizer compresses the whole cycle
            // (same tick count, 3-min ticks instead of 5-min); once the
            // beets mature, the holes themselves are roll sites and flip
            // the soil - the strip rides along in that window.
            if (entry.phase.aux || entry.phase.strip || !entry.cells.length) return false;
            var need = entry.phase.rollNeeds || {};
            var required = {};
            entry.cells.forEach(function (c) {
                required[c.key] = need[c.key] || 1;
            });
            // Fungus/weed mutations also roll against plotBoost[2] (zeroed
            // by a tidygrass/everdaisy aura): a suppressed tile is not a
            // site no matter what stands around it.
            var tgt = (entry.phase.targets || [])[0];
            var tgtFungal = tgt && G.plants[tgt] && (G.plants[tgt].fungus || G.plants[tgt].weed);
            for (var ry = 0; ry < 6; ry++) {
                for (var rx = 0; rx < 6; rx++) {
                    if (G.plot[ry][rx][0]) continue;
                    if (tgtFungal && G.plotBoost && G.plotBoost[ry] &&
                        G.plotBoost[ry][rx] && !G.plotBoost[ry][rx][2]) continue;
                    var counts = {};
                    gardenNeighbors(rx, ry).forEach(function (n) {
                        var t = G.plot[n.y][n.x];
                        if (!t[0]) return;
                        var p = G.plantsById[t[0] - 1];
                        if (t[1] >= p.mature) counts[p.key] = (counts[p.key] || 0) + 1;
                    });
                    var site = true;
                    for (var k in required) {
                        if ((counts[k] || 0) < required[k]) {
                            site = false;
                            break;
                        }
                    }
                    if (site) return true;
                }
            }
            return false;
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

// Debug helper: call gardenBotStatus() in the console to see what the bot is
// doing right now - active phases with per-tile state, protected sprouts,
// soil and unlock progress. Read-only (builds a plan without acting on it).
function gardenBotStatus() {
    if (!G) G = Game.Objects["Farm"].minigame;
    if (!G || !G.plot || !G.plants) return "garden not loaded";
    var plan = gardenBuildPlan();
    var status = {
        unlocked: G.plantsUnlockedN + "/" + (G.plantsN || 34),
        soil: G.soilsById[G.soil] ? G.soilsById[G.soil].name : G.soil,
        gridActive: plan.gridActive,
        jqb: plan.jqb ? "@" + plan.jqb.x + "," + plan.jqb.y + " age " + plan.jqb.age.toFixed(0) : null,
        phases: plan.active.map(function (entry) {
            return {
                id: entry.phase.id,
                targets: (entry.phase.targets || []).join(","),
                cells: entry.cells.map(function (c) {
                    var t = G.plot[c.y][c.x];
                    var state;
                    if (!t[0]) {
                        state = plan.deferred[c.x + "," + c.y] ? "deferred" : "empty";
                    } else if (t[0] - 1 === G.plants[c.key].id) {
                        state = t[1] >= G.plants[c.key].mature ? "mature" : "growing";
                    } else {
                        state = "squatted:" + G.plantsById[t[0] - 1].key;
                    }
                    return c.key + "@" + c.x + "," + c.y + " " + state;
                }),
            };
        }),
        fixtures: {},
        sprouts: [],
    };
    // Fixtures and fillers (shelf, trio, CpS wheat, weed sowing...) hold
    // plant claims without appearing in plan.active: group them by owner.
    var activeIds = {};
    plan.active.forEach(function (entry) { activeIds[entry.phase.id] = true; });
    Object.keys(plan.claims).forEach(function (id) {
        var c = plan.claims[id];
        if (c.kind !== "plant" || activeIds[c.phase]) return;
        var xy = id.split(",");
        var fx = Number(xy[0]);
        var fy = Number(xy[1]);
        var ft = G.plot[fy][fx];
        var state;
        if (!ft[0]) {
            state = plan.deferred[id] ? "deferred" : "empty";
        } else if (ft[0] - 1 === G.plants[c.key].id) {
            state = ft[1] >= G.plants[c.key].mature ? "mature" : "growing";
        } else {
            state = "squatted:" + G.plantsById[ft[0] - 1].key;
        }
        (status.fixtures[c.phase] = status.fixtures[c.phase] || []).push(c.key + "@" + fx + "," + fy + " " + state);
    });
    // Large groups (e.g. the CpS backfill) get summarized instead of listed
    Object.keys(status.fixtures).forEach(function (k) {
        if (status.fixtures[k].length > 6) {
            var counts = {};
            status.fixtures[k].forEach(function (s) {
                var tag = s.split("@")[0] + " " + s.split(" ")[1];
                counts[tag] = (counts[tag] || 0) + 1;
            });
            status.fixtures[k] = Object.keys(counts).map(function (t) { return t + " x" + counts[t]; });
        }
    });
    for (var y = 0; y < 6; y++) {
        for (var x = 0; x < 6; x++) {
            var t = G.plot[y][x];
            if (t[0] && !G.plantsById[t[0] - 1].unlocked) {
                var p = G.plantsById[t[0] - 1];
                status.sprouts.push(p.key + "@" + x + "," + y + " age " + t[1].toFixed(0) + "/" + p.mature);
            }
        }
    }
    return status;
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

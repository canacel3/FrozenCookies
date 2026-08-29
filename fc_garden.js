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

// The nine P10 targets; the cronerice trio at (0,4),(2,4),(4,4) stays planted
// until all of them are unlocked.
var GARDEN_P10_TARGETS = [
    "greenRot",
    "keenmoss",
    "wrinklegill",
    "glovemorel",
    "cheapcap",
    "doughshroom",
    "foolBolete",
    "wardlichen",
    "drowsyfern",
];

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

// Golden clover wiki layout (0-indexed), shrunk to rows y0-4 so the resident
// elderwort shelf on y=5 survives.
var GARDEN_P15_PLOTS = [
    [0, 0], [1, 0], [3, 0], [5, 0],
    [1, 1], [3, 1], [5, 1],
    [0, 2], [3, 2], [5, 2],
    [0, 3], [2, 3], [5, 3],
    [0, 4], [2, 4], [4, 4],
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
    for (var y = 0; y < 5; y++) {
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
    // Weed farming for brown mold + crumbspore: keep x4-5 empty, harvest
    // meddleweed right before it dies. Soil stays fertilizer while active.
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
    // Contamination-splitting layout: crumbspore/doughshroom parents keep even
    // spacing on row 1, the partner goes to row 3 with no orthogonal contact.
    { id: "P10-3", targets: ["wrinklegill"],
        cells: gardenRow("crumbspore", 1, GARDEN_X_EVEN).concat(gardenRow("brownMold", 3, GARDEN_X_EVEN)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P10-4", targets: ["glovemorel"],
        cells: gardenRow("crumbspore", 1, GARDEN_X_EVEN).concat(gardenRow("thumbcorn", 3, GARDEN_X_EVEN)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P10-5", targets: ["cheapcap"],
        cells: gardenRow("crumbspore", 1, GARDEN_X_EVEN).concat(gardenRow("shimmerlily", 3, GARDEN_X_EVEN)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P10-6", targets: ["doughshroom"],
        cells: gardenRow("crumbspore", 1, GARDEN_X_EVEN),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P10-7", targets: ["foolBolete"],
        cells: gardenRow("doughshroom", 1, GARDEN_X_EVEN).concat(gardenRow("greenRot", 3, GARDEN_X_EVEN)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P10-8", targets: ["wardlichen"],
        cells: gardenRow("cronerice", 4, GARDEN_X_EVEN).concat(gardenRow("whiteMildew", 4, [1, 3])),
        zone: gardenZoneRows([3, 5], GARDEN_X_ALL) },
    { id: "P10-9", targets: ["drowsyfern"],
        cells: gardenRow("chocoroot", 1, GARDEN_X_EVEN).concat(gardenRow("keenmoss", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P11-1", targets: ["whiskerbloom"],
        cells: gardenRow("shimmerlily", 1, GARDEN_X_EVEN).concat(gardenRow("whiteChocoroot", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    { id: "P11-2", targets: ["nursetulip"],
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
        cells: gardenRow("crumbspore", 3, [1, 3]).concat(gardenRow("elderwort", 5, GARDEN_X_ALL)),
        zone: gardenZoneRows([4], [0, 1, 2, 3, 4]) },
    { id: "P14", targets: ["everdaisy"],
        cells: gardenRow("tidygrass", 3, GARDEN_X_ALL).concat(gardenRow("elderwort", 5, GARDEN_X_ALL)),
        zone: gardenZoneRows([4], [1, 2, 3, 4]) },
    { id: "P15", targets: ["goldenClover"],
        cells: gardenP15Cells(),
        zone: gardenP15Zone() },
    { id: "P16a", targets: ["queenbeet"],
        cells: gardenRow("bakeberry", 1, GARDEN_X_EVEN).concat(gardenRow("chocoroot", 1, GARDEN_X_ODD)),
        zone: gardenZoneRows([0, 2], GARDEN_X_ALL) },
    // Background wheat lanes: bakeberry is only 0.1%, so keep wheat in any free
    // lane tiles from P1 all the way until it finally unlocks.
    { id: "fillerL1", targets: ["bakeberry"], partial: true,
        cells: gardenRow("bakerWheat", 1, GARDEN_X_LEFT),
        zone: gardenZoneRows([0, 2], GARDEN_X_LEFT) },
    { id: "fillerL2", targets: ["bakeberry"], partial: true,
        cells: gardenRow("bakerWheat", 4, [0, 1, 2, 3, 5]),
        zone: gardenZoneRows([3, 5], GARDEN_X_ALL) },
];

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
        weedActive: false,
        gridActive: false,
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

    // Find a growing Juicy queenbeet (never removed; harvested at 85+ for a lump)
    var jqbId = G.plants["queenbeetLump"].id;
    for (var jy = 0; jy < 6; jy++) {
        for (var jx = 0; jx < 6; jx++) {
            if (G.plot[jy][jx][0] - 1 === jqbId) {
                plan.jqb = { x: jx, y: jy, age: G.plot[jy][jx][1] };
            }
        }
    }

    var preComplete = Object.keys(G.plants).every(function (key) {
        return GARDEN_LATE_SEEDS[key] || G.plants[key].unlocked;
    });
    var lateComplete = gardenUnlocked("queenbeetLump") && gardenUnlocked("duketater") && gardenUnlocked("shriekbulb");
    plan.gridActive = preComplete && (!lateComplete || !!plan.jqb);

    // Fixture: resident elderwort shelf on y=5 (shrinks to (5,5) for the grid)
    if (gardenUnlocked("elderwort")) {
        (plan.gridActive ? [5] : GARDEN_X_ALL).forEach(function (x) {
            claim(x, 5, "plant", "elderwort", "shelf");
        });
    }

    // Fixture: cronerice trio, planted in P2 and kept until P10 is done
    var p10Done = GARDEN_P10_TARGETS.every(gardenUnlocked);
    if (gardenUnlocked("cronerice") && !p10Done) {
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
        // Queenbeet grid: plant everything except the 9 odd/odd tiles; (5,5)
        // stays elderwort, the other 8 holes are the JQB/duketater/shriekbulb
        // mutation slots.
        var gridCells = [];
        for (var gy = 0; gy < 6; gy++) {
            for (var gx = 0; gx < 6; gx++) {
                if (gx % 2 === 1 && gy % 2 === 1) {
                    if (!(gx === 5 && gy === 5)) claim(gx, gy, "zone", null, "P16-grid");
                    continue;
                }
                if (freeFor({ x: gx, y: gy, key: "queenbeet" })) {
                    claim(gx, gy, "plant", "queenbeet", "P16-grid");
                    gridCells.push({ key: "queenbeet", x: gx, y: gy });
                }
            }
        }
        plan.active.push({ phase: { id: "P16-grid" }, cells: gridCells });
    }

    gardenPhases.forEach(function (phase) {
        if (phase.targets.every(gardenUnlocked)) return; // done
        if (phase.weed) {
            plan.weedActive = true;
            for (var wy = 0; wy < 6; wy++) {
                for (var wx = 4; wx < 6; wx++) {
                    claim(wx, wy, "weed", null, phase.id);
                }
            }
            return;
        }
        if (!phase.cells.every(function (c) { return gardenUnlocked(c.key); })) return; // parents not available yet
        var cells = phase.cells;
        if (phase.partial) {
            cells = cells.filter(freeFor);
            if (!cells.length) return;
        } else if (!cells.every(freeFor)) {
            return; // an earlier phase/fixture holds these tiles
        }
        cells.forEach(function (c) {
            claim(c.x, c.y, "plant", c.key, phase.id);
        });
        (phase.zone || []).forEach(function (c) {
            claim(c.x, c.y, "zone", null, phase.id);
        });
        plan.active.push({ phase: phase, cells: cells });
    });

    return plan;
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

            // Meddleweed: farm it in the weed zone, remove it on sight anywhere
            // else (5%/tick contamination). Harvesting a mature one still rolls
            // the seed drops either way.
            if (plant.key === "meddleweed") {
                if (cur && cur.kind === "weed") {
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
                if (age >= plant.mature) {
                    G.harvest(x, y);
                    gardenLog("harvest", plant.key + " @" + x + "," + y + " (new seed)");
                }
                continue;
            }

            // Everything else survives only where the plan wants that species
            if (cur && cur.kind === "plant" && cur.key === plant.key) continue;
            G.harvest(x, y);
            gardenLog("thin", plant.key + " @" + x + "," + y);
        }
    }
}

// Plant whatever the plan wants into empty tiles. Runs every pass (planting is
// allowed at any time), but never while a buff inflates plant prices.
function gardenPlantPass(plan) {
    if (Object.keys(Game.buffs).length !== 0) return;
    var planted = false;
    Object.keys(plan.claims).forEach(function (id) {
        var c = plan.claims[id];
        if (c.kind !== "plant") return;
        var xy = id.split(",");
        var x = Number(xy[0]);
        var y = Number(xy[1]);
        if (G.plot[y][x][0]) return;
        var plant = G.plants[c.key];
        if (!plant || !plant.unlocked || plant.plantable === false) return;
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
        var allMature = plan.active.every(function (entry) {
            return entry.cells.every(function (c) {
                var tile = G.plot[c.y][c.x];
                var plant = G.plants[c.key];
                return tile[0] - 1 === plant.id && tile[1] >= plant.mature;
            });
        });
        if (allMature) want = GARDEN_SOIL_WOODCHIPS;
    }
    if (G.soil === want) return;
    if (Date.now() < G.nextSoil) return;
    var soil = G.soilsById[want];
    if (!soil || (soil.req || 0) > G.parent.level) return;
    G.askSoil(want);
    Game.ConfirmPrompt();
    if (G.soil === want) gardenLog("soil", soil.name);
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

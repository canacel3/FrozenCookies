# 庭自動化 仕様書(6×6 / 全34種コンプ→Sacrificeループ)

本書は手順書(garden_交配手順書_6x6.md)を自動化するための仕様。数値はすべて本家ソース(minigameGarden.js)から抽出した実値。

## 1. 目的と範囲

- 目標: 全34種の種を解禁 → JQB収穫(ランプ+1) → Sacrifice Garden(ランプ+10) → 再コンプ、のループを自動運転する。
- 対象外: 砂糖玉の使途、FC設定の変更、転生。FrozenCookiesとは共存(FCは平常時に庭へ干渉しない。転生時の`harvestAll`のみ許容)。
- 実行形態: **フォーク版FrozenCookiesの1機能(`fc_garden.js`)として組み込む**。詳細は§10。

## 2. 座標系と用語

- マスは `(x, y)`。x=列0〜5(左→右)、y=行0〜5(上→下)。
- 盤面読み取り: `G.plot[y][x]` = `[植物ID+1, 樹齢]`(0は空きマス)。**yが先**である点に注意。
- 「成熟」= 樹齢 ≥ その種の`mature`値。樹齢は100で寿命(immortalを除く)。
- tick: 庭は`G.nextStep`(エポックms)の時刻に1tick進む。変異・成長・汚染はすべてtick時のみ発生。

## 3. ゲームAPIリファレンス

| 操作 | 呼び出し | 備考 |
|---|---|---|
| ミニゲーム参照 | `var G = Game.Objects["Farm"].minigame` | ロード確認必須 |
| 盤面読み取り | `G.plot[y][x]` | `[id+1, age]` |
| 植物定義 | `G.plantsById[id]` / `G.plants[key]` | `.mature` `.unlocked` `.plantable` |
| 種の選択+植付 | `G.seedSelected = G.plants[key].id;` → `l('gardenTile-'+x+'-'+y).click()` | FCと同方式。植付後`G.seedSelected=-1`に戻す |
| 植付可否 | `G.canPlant(G.plants[key])` | クッキー残高チェック |
| 収穫/撤去 | `G.harvest(x, y)` | 成熟前でも撤去に使う |
| 全収穫 | `G.harvestAll()` | 原則使用しない(常駐枠を巻き込むため) |
| 土変更 | `G.askSoil(id)` → 確認プロンプト | id: 0=Dirt 1=Fertilizer 2=Clay 3=Pebbles 4=Wood chips。`Date.now() >= G.nextSoil`のときのみ。UI経由(`l('gardenSoil-'+id).click()`)が安全 |
| 次tick時刻 | `G.nextStep` | この直後に盤面処理を行う |
| 解禁数 | `G.plantsUnlockedN` | 34で犠牲可能 |
| 犠牲 | `G.askConvert()` → `Game.ConfirmPrompt()` | 種ログ初期化+ランプ10 |
| バフ確認 | `Object.keys(Game.buffs).length === 0` | 植付ガード |

## 4. 植物データ表(ソース実値)

樹齢は毎tick `ageTick + rand(0, ageTickR)` 増加。「成熟tick数(平均)」= mature ÷ (ageTick + ageTickR/2)。

| key | 表示名 | mature | ageTick(+R) | 成熟tick(平均) | 特性 |
|---|---|---|---|---|---|
| bakerWheat | Baker's wheat | 35 | 7+2 | 5 | |
| thumbcorn | Thumbcorn | 20 | 6+2 | 3 | |
| cronerice | Cronerice | 55 | 0.4+0.7 | 74 | **激遅** |
| gildmillet | Gildmillet | 40 | 2+1.5 | 15 | |
| clover | Ordinary clover | 35 | 1+1.5 | 20 | |
| goldenClover | Golden clover | 50 | 4+12 | 5 | 短命 |
| shimmerlily | Shimmerlily | 70 | 5+6 | 9 | |
| elderwort | Elderwort | 90 | 0.3+0.5 | 129〜164 | **不死** |
| bakeberry | Bakeberry | 50 | 1+1 | 33 | |
| chocoroot | Chocoroot | 25 | 4+0 | 7 | |
| whiteChocoroot | White chocoroot | 25 | 4+0 | 7 | |
| whiteMildew | White mildew | 70 | 8+12 | 5 | 菌・短命 |
| brownMold | Brown mold | 70 | 8+12 | 5 | 菌・短命 |
| meddleweed | Meddleweed | 50 | 10+6 | 4 | 雑草・**汚染5%** |
| whiskerbloom | Whiskerbloom | 60 | 2+2 | 20 | |
| chimerose | Chimerose | 30 | 1+1.5 | 17 | |
| nursetulip | Nursetulip | 60 | 0.5+2 | 40 | |
| drowsyfern | Drowsyfern | 30 | 0.05+0.1 | 300 | 激遅(親用途なし) |
| wardlichen | Wardlichen | 65 | 5+4 | 9 | |
| keenmoss | Keenmoss | 65 | 4+5 | 10 | |
| queenbeet | Queenbeet | 80 | 1+0.4 | 67 | |
| queenbeetLump | Juicy queenbeet | 85 | 0.04+0.08 | **1063** | 植付不可・収穫でランプ+1 |
| duketater | Duketater | 95 | 0.4+0.1 | 211 | |
| crumbspore | Crumbspore | 65 | 3+3 | 14 | 菌・**汚染3%**・被汚染免疫 |
| doughshroom | Doughshroom | 85 | 1+2 | 43 | 菌・**汚染3%**・被汚染免疫 |
| glovemorel | Glovemorel | 80 | 3+18 | 7 | 菌 |
| cheapcap | Cheapcap | 40 | 6+16 | 3 | 菌 |
| foolBolete | Fool's bolete | 50 | 5+25 | 3 | 菌 |
| wrinklegill | Wrinklegill | 65 | 1+3 | 26 | 菌 |
| greenRot | Green rot | 65 | 12+13 | 4 | 菌・短命 |
| shriekbulb | Shriekbulb | 60 | 3+1 | 17 | |
| tidygrass | Tidygrass | 40 | 0.5+0 | 80 | |
| everdaisy | Everdaisy | 75 | 0.3+0 | 250 | **不死** |
| ichorpuff | Ichorpuff | 35 | 1+1.5 | 20 | 菌 |

**汚染**: contam持ち(meddleweed 5%/tick、crumbspore・doughshroom 3%/tick)は隣接マスの植物を毎tick確率で自種に置換する。crumbspore/doughshroomは被汚染免疫(`noContam`)。→ 汚染持ちを大事な親に隣接させない配置制約(§6)。

## 5. 変異レシピ表(ソース実値・条件式そのまま)

`M`=成熟必須、`A`=樹齢不問。確率は素の値/tick(ウッドチップで×3)。

| 目標 | 条件 | 率 |
|---|---|---|
| thumbcorn | bakerWheat M×2 | 5% |
| bakeberry | bakerWheat M×2 | 0.1% |
| cronerice | bakerWheat M + thumbcorn M | 1% |
| gildmillet | cronerice M + thumbcorn M | 3% |
| clover | bakerWheat M + gildmillet M | 3% |
| goldenClover | 同上(0.07%) / clover M×4以上(0.07%) | |
| shimmerlily | clover M + gildmillet M | 2% |
| elderwort | shimmerlily M + cronerice M | 1% |
| chocoroot | bakerWheat M + brownMold **A** | 10% |
| whiteChocoroot | chocoroot M + whiteMildew **A** | 10% |
| brownMold | whiteMildew M かつ brownMold A≦1 | 50% |
| whiteMildew | brownMold M かつ whiteMildew A≦1 | 50% |
| meddleweed | 隣接植物ゼロの空きマスに自然発生(0.2%×土倍率) / meddleweed M かつ計3以下で15%。収穫時ドロップ率=樹齢×0.1% |
| whiskerbloom | shimmerlily M + whiteChocoroot M | 1% |
| chimerose | shimmerlily M + whiskerbloom M | 5% |
| nursetulip | whiskerbloom M×2 | 5% |
| drowsyfern | chocoroot M + keenmoss M | 0.5% |
| wardlichen | cronerice M + (keenmoss M または whiteMildew M) | 0.5% |
| keenmoss | greenRot M + brownMold M | 10% |
| queenbeet | chocoroot M + bakeberry M | 1% |
| queenbeetLump | queenbeet M×8 | 0.1% |
| duketater | queenbeet M×2 | 0.1% |
| glovemorel | crumbspore M + thumbcorn M | 2% |
| cheapcap | crumbspore M + shimmerlily M | 4% |
| foolBolete | doughshroom M + greenRot M | 4% |
| doughshroom | crumbspore M×2 | 0.5% |
| crumbspore | crumbspore M×1 かつ計1以下(7%) / doughshroom M×2(0.5%) | |
| wrinklegill | crumbspore M + brownMold M | 6% |
| greenRot | whiteMildew M + clover M | 5% |
| shriekbulb | duketater **A**×3(0.5%) / queenbeet M×5(0.1%) / elderwort M×5(0.1%) / wrinklegill M+elderwort M(0.1%) | |
| tidygrass | bakerWheat M + whiteChocoroot M | 0.2% |
| everdaisy | tidygrass M×3 + elderwort M×3 | 0.2% |
| ichorpuff | elderwort M + crumbspore M | 0.2% |

## 6. 盤面ゾーンとレイアウト

固定ゾーン(フェーズを跨いで維持):

```
y=0: [レーン1変異行]
y=1: [レーン1親行]
y=2: [レーン1変異行]
y=3: [レーン2変異行]  ※一部フェーズで親を置く
y=4: [レーン2親行]
y=5: [P10以降: Elderwort常駐棚(x0〜5)]  ※P16で(5,5)以外撤去
x=5列: [P3完了まで雑草ゾーン(P1〜P4はレーンをx0〜3に制限)]
```

- **2種交配の標準形**: 親行に種Aを偶数x、種Bを奇数xで交互配置。
- **汚染分離形**(crumbspore/doughshroomが親のとき): 汚染種を親行の偶数xのみに置き、相方は**別の行**の偶数xに置く(直交隣接を作らない)。具体座標は§7の各フェーズに明記。
- 変異行の空きマスに湧いた「目標外の植物」は次回処理時に撤去(§8)。

## 7. フェーズ定義(全種の植付座標)

各フェーズ: 前提 → 植付(種key@座標) → 完了条件。完了条件は原則「目標種の`unlocked`」。植付は種が解禁済みならいつでも種ストアから可能(在庫確保の概念は不要)。

**P1: thumbcorn / bakeberry**
- 植付: bakerWheat @ (0..3, 1) と (0..3, 4) の8本
- 完了: thumbcorn かつ bakeberry 解禁(bakeberryは0.1%なので長引く。P2以降と並走し、bakeberry未解禁の間はレーン2をP1構成のまま維持してよい)

**P2: cronerice**
- 植付: レーン1: bakerWheat @ (0,1),(2,1) / thumbcorn @ (1,1),(3,1)
- 解禁後即: cronerice @ (0,4),(2,4),(4,4) に3本植えて放置育成(74tick≒肥料3.7h)。**以後P10までこの3本は撤去禁止**
- 完了: cronerice解禁+3本植付済み

**P3: brownMold / crumbspore(雑草)**
- 条件: x=5列の6マスを空けておく(レーンはx0〜3)。**土は本フェーズ完了まで肥料固定**(ウッドチップは雑草-90%)
- 動作: meddleweedが湧いたら樹齢84以上で`G.harvest`(ドロップ率=樹齢×0.1%、次tickで寿命死のため84が上限目安)。汚染5%持ちのため、雑草がレーン隣接マスに自己増殖した場合は即撤去
- 完了: brownMold かつ crumbspore 解禁

**P4: chocoroot / whiteMildew**
- 植付: レーン1: bakerWheat @ (0,1),(2,1) / brownMold @ (1,1),(3,1)(樹齢不問だが寿命7tickで枯れるため死亡検知→即再植付)
- whiteMildewはbrownMold成熟時に50%で周囲へ勝手に湧いて解禁される(併走目標)
- 完了: chocoroot かつ whiteMildew 解禁

**P5: whiteChocoroot**
- 植付: レーン1: chocoroot @ (0,1),(2,1) / whiteMildew @ (1,1),(3,1)(要再植付管理)
- 完了: whiteChocoroot解禁

**P6: gildmillet**(P2のcronerice成熟後)
- 植付: レーン2: cronerice @ (0,4),(2,4),(4,4)(既設) / thumbcorn @ (1,4),(3,4),(5,4)
- 完了: gildmillet解禁 ※P3完了後はx4〜5列も解放されている前提
- 併走可: レーン1でP5

**P7: clover**
- 植付: レーン1: bakerWheat @ (0,1),(2,1),(4,1) / gildmillet @ (1,1),(3,1),(5,1)
- 完了: clover解禁(goldenCloverが0.07%で先に出たら儲けもの)

**P8: shimmerlily**
- 植付: レーン1: clover @ (0,1),(2,1),(4,1) / gildmillet @ (1,1),(3,1),(5,1)
- 完了: shimmerlily解禁

**P9: elderwort**
- 植付: レーン2: cronerice(既設3本) / shimmerlily @ (1,4),(3,4),(5,4)
- 完了: elderwort解禁 → 即 elderwort @ (0,5)〜(5,5) に6本植付(常駐棚。成熟まで平均8h。**P16まで撤去禁止**)

**P10: greenRot → keenmoss → wrinklegill ほか菌類**
順に消化。汚染分離形はcrumbsporeを(0,1),(2,1),(4,1)に置き、相方を(0,3),(2,3),(4,3)に置く(変異行はy=2の6マス+y=0)。
1. greenRot: whiteMildew @ (0,1),(2,1),(4,1) / clover @ (1,1),(3,1),(5,1) → 解禁
2. keenmoss: greenRot @ 偶数x / brownMold @ 奇数x(レーン1、両方非汚染なので標準形可)→ 解禁
3. wrinklegill: **汚染分離形** crumbspore @ (0,1),(2,1),(4,1) / brownMold @ (0,3),(2,3),(4,3) → 解禁
4. glovemorel: crumbspore @ (0,1),(2,1),(4,1) / thumbcorn @ (0,3),(2,3),(4,3) → 解禁
5. cheapcap: crumbspore @ (0,1),(2,1),(4,1) / shimmerlily @ (0,3),(2,3),(4,3) → 解禁
6. doughshroom: crumbspore @ (0,1),(2,1),(4,1) のみ(単種・0.5%。相互に非隣接なので汚染は起きない)→ 解禁
7. foolBolete: **汚染分離形** doughshroom @ (0,1),(2,1),(4,1) / greenRot @ (0,3),(2,3),(4,3) → 解禁
8. wardlichen: レーン2で cronerice(既設があれば流用、なければ@(0,4),(2,4),(4,4)) / whiteMildew @ (1,4),(3,4)(非汚染・標準形)→ 解禁
9. drowsyfern: chocoroot @ (0,1),(2,1),(4,1) / keenmoss @ (1,1),(3,1),(5,1) → 解禁

**P11: whiskerbloom → nursetulip → chimerose**
1. whiskerbloom: shimmerlily @ 偶数x / whiteChocoroot @ 奇数x(レーン1)
2. nursetulip: whiskerbloom @ (0..5,1) 単種
3. chimerose: shimmerlily @ 偶数x / whiskerbloom @ 奇数x
- 完了: 3種解禁

**P12: tidygrass**
- 植付: レーン1: bakerWheat @ 偶数x / whiteChocoroot @ 奇数x(0.2%と低率のため、レーン2が空いていれば同構成を複製)
- 完了: tidygrass解禁

**P13: ichorpuff**
- 植付: crumbspore @ (1,3),(3,3)(直交隣接に常駐elderwortが来ない位置)。変異マスはy=4行(常駐棚y=5のelderwortと(1,3)等のcrumbsporeの両方に隣接する(0..4,4))
- 前提: 常駐elderwort成熟済み
- 完了: ichorpuff解禁

**P14: everdaisy**
- 植付: tidygrass @ (0,3)〜(5,3) 6本(成熟80tick≒肥料4h)
- 変異マス: y=4行の(1,4)〜(4,4)(上にtidygrass3本+下に常駐elderwort3本)
- 完了: everdaisy解禁 → tidygrass撤去

**P15: goldenClover(未解禁の場合のみ)**
- 盤面をクリア(常駐棚y=5は残す。wiki配置の下段はy=5を使わない列構成に読み替え不可のため、常駐棚と重なる(0,5),(2,5),(4,5),(5,5)は諦め、上5行ぶんだけ使う)
- 植付(clover、wiki配置の0-indexed): (0,0),(1,0),(3,0),(5,0),(1,1),(3,1),(5,1),(0,2),(3,2),(5,2),(0,3),(2,3),(5,3),(0,4),(2,4),(4,4)
- 完了: goldenClover解禁

**P16: queenbeet → JQB格子(duketater / shriekbulb / queenbeetLump)**
1. queenbeet解禁: レーン1: bakeberry @ 偶数x / chocoroot @ 奇数x → 解禁
2. 常駐elderwortを(5,5)を残して撤去
3. **格子植付**: queenbeet を「x∈{1,3,5} かつ y∈{1,3,5} の9マスと(5,5)」**以外の26マス**に植付(コスト60分CpS/本のためバフガード厳守・分割植付可)
4. 空きマス9個の役割(自動判定不要、抽選は勝手に回る): ⑧=(1,1),(3,1),(1,3),(3,3)→JQB0.1%、⑤=(5,1),(5,3),(1,5),(3,5)→shriekbulb0.1%、全9マス→duketater0.1%
5. duketater/shriekbulbが未解禁のうちは湧いたら成熟まで待って収穫(解禁)。解禁済みなら即撤去してマスを空け直す
6. **JQBが湧いたら**: 成熟まで平均1063tick。隣接QBが枯れたマスにelderwortを植えて老化+3%/本を付与(最大8本)。**樹齢85以上100未満で必ず`G.harvest`**(自然死はランプなし)。収穫でランプ+1+種解禁
- 完了: queenbeet / duketater / shriekbulb / queenbeetLump 解禁

**P17: Sacrifice**
- 条件: `G.plantsUnlockedN === 34` かつ `autoSacrifice === true`(**デフォルトtrue**=全自動ループ。falseは初回サイクルの動作確認用で、通知のみ出して停止)
- 動作: `G.askConvert()` → `Game.ConfirmPrompt()` → ランプ+10、種ログ初期化 → P1へ戻る

**フェーズ復帰**: 起動時は解禁済み種の集合から「未完了の最初のフェーズ」を特定して再開する(P1→P17の順で完了条件を評価)。

## 8. 共通ポリシー

- **tick同期**: 盤面の判定・間引き・植え直しは`G.nextStep`経過直後の1回だけ実行(logicフック内で前回処理済みtickを記録)。植付はいつでも可だが、まとめてtick直後に行う。
- **間引き分類**: 各マスを毎処理で分類する。(a)現フェーズの親座標にある指定種→維持、(b)常駐棚・育成中cronerice・JQB→維持、(c)変異行に湧いた未解禁種→成熟まで維持し、成熟したら`G.harvest`(種解禁)、(d)変異行に湧いた解禁済み種・雑草・ゴミ→即撤去。
- **土制御**: P3完了まで肥料固定。以降は「アクティブなレシピの親が全員成熟→ウッドチップ / それ以外→肥料」。切替は`Date.now() >= G.nextSoil`のときのみ(10分CD)。
- **植付ガード**: `Object.keys(Game.buffs).length === 0` かつ `G.canPlant(plant)` のときのみ植付。バフ中は次tickへ持ち越し。
- **汚染ガード**: crumbspore/doughshroom/meddleweedを、指定座標以外(特に常駐棚の直交隣接)に置かない。これらが自己増殖・汚染で指定外マスに現れたら即撤去。
- **JQB特別則**: queenbeetLumpは撤去対象に絶対含めない。収穫は樹齢85〜99のみ。
- **ログ**: 操作履歴は配列(`window.gardenBotLog`)へ。console出力はしない(パフォーマンス方針)。
- **停止**: `window.gardenBotEnabled = false`で全動作停止。フリーズ機能は使用しない。

## 9. 既知の設計判断(コード側で変更可)

- Everdaisyはwikiの9マス織り込み配置ではなく、常駐棚を活かした4マスサンド構成を採用(配置転記ミスの回避と常駐elderwortの再利用を優先。0.2%×3倍×4マス≒期待42tickで実用十分)。
- goldenCloverのwiki配置はy=5行を常駐棚に譲る縮小版(有効マスは16→約11)。
- shriekbulbはJQB格子の⑤マスで受動的に取る(専用フェーズなし)。duketater単独フェーズも同様に不要。
- bakeberry(0.1%)はP1を長引かせる主因のため、P2〜P5の間もレーン2をP1構成のまま並走させる実装を推奨。

## 10. FrozenCookies組み込み仕様

- **モジュール**: 新規ファイル`fc_garden.js`。ローダー(`frozen_cookies.js`および各loader)の読み込みリストへ追加。庭参照はfc_main.jsの既存グローバル`G`を流用(`if (!G) G = Game.Objects["Farm"].minigame`の再取得パターンも踏襲)。
- **スケジューリング**: `FCStart()`内で `if (FrozenCookies.autoGarden) FrozenCookies.gardenBot = setInterval(autoGarden, 5000);`。**必須**: `FCStart`冒頭のボット停止処理に`gardenBot`を追加する(`clearInterval(FrozenCookies.gardenBot); FrozenCookies.gardenBot = 0;`)。既存の`frenzyClickBot`/`autoFrenzyBot`が停止リストに未登録のまま設定OFFですり抜けるバグがあるため、同型のガード漏れを作らないこと(可能なら当該バグも同時に修正)。
- **設定**: `fc_preferences.js`に3値設定`autoGarden`を追加 — 0: OFF / 1: ON(Sacrificeまで全自動ループ) / 2: 検証モード(34種到達でSacrificeせず通知して待機)。§7 P17の`autoSacrifice`フラグはこの設定値で代替する(1=auto、2=通知のみ)。
- **通知・ログ**: 種の解禁・Sacrifice実行・JQB収穫は`Game.Notify`、通常の植付・間引きはFCの`logEvent`へ。console出力は行わない。
- **状態管理**: フェーズは毎回、解禁済み種の集合と盤面から再導出する(ステートレス)。永続化する独自状態は持たない。これにより転生(`fcReset`の`harvestAll`)・リロード・設定OFF→ONのいずれからも自動復帰する。
- **干渉制約**:
  - 100% Consistency Combo(fc_spells.js)は全収穫+Whiskerbloom全面植えで盤面を破壊するため、`autoGarden`有効中はコンボの庭ステップをスキップする(または設定を相互排他にする)。
  - Harvesting Bank系設定とは読み取り共存(本機能はリザーブ計算に関与しない)。
  - 本機能はFCのランプ自動収穫(`autoSL`)・Dragon's Curveスワップとは独立(庭のJQB収穫はランプ収穫APIと無関係)。

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
| 土変更 | `l('gardenSoil-'+id).click()`(本家ハンドラが状態とUIハイライトを両方更新する)。ボタンDOM未構築時のみ `G.soil = id; G.nextSoil = Date.now()+10分; G.toRebuild = true; Game.recalculateGains = 1` を直接代入。`askSoil`というAPIは**存在しない** | id: 0=Dirt 1=Fertilizer 2=Clay 3=Pebbles 4=Wood chips。`Date.now() >= G.nextSoil` かつ 生涯収穫数`G.harvestsTotal >= soil.req`(肥料50/ウッドチップ300)のときのみ |
| 次tick時刻 | `G.nextStep` | この直後に盤面処理を行う |
| 解禁数 | `G.plantsUnlockedN` | 34で犠牲可能 |
| 犠牲 | `G.askConvert()` → `Game.ConfirmPrompt()` | 種ログ初期化+ランプ10 |
| バフ確認 | `Game.buffs`の各バフの`multCpS > 1`を検査 | 植付ガード(CpS増加系のみ植付禁止) |

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
y=5: [P9以降: Elderwort常駐棚(x0〜5)]  ※ichorpuff・everdaisy確保で退役(P15に全面を明け渡す)。P16グリッドでは(5,5)のみ再確保
x=4〜5列: [P3完了まで雑草の湧き保証回廊として予約(P1〜P4はレーンをx0〜3に制限)。
          雑草の飼育自体はP3の通り盤面全域の安全マスで行う]
```

- **2種交配の標準形**: 親行に種Aを偶数x、種Bを奇数xで交互配置。
- **汚染分離形**(crumbspore/doughshroomが親のとき): 汚染種をy=0の偶数x、相方をy=2の偶数xに置く(2行分離で直交隣接を作らない。間のy=1が両種に接する共有変異行になる)。レーン1の3行(y=0〜2)で完結するため、レーン2を使うフェーズ(P9・P12b等)と並走できる。具体座標は§7の各フェーズに明記。
- 変異行の空きマスに湧いた「目標外の植物」は次回処理時に撤去(§8)。

## 7. フェーズ定義(全種の植付座標)

各フェーズ: 前提 → 植付(種key@座標) → 完了条件。完了条件は原則「目標種が解禁済み(`unlocked`)**または盤面に存在(芽が出ている)**」。芽は§8(c)により場所を問わず成熟→収穫まで保護されるため、変異が出た時点で親マスを解放してよい(芽を収穫前に失った場合はフェーズが自動で再開する)。植付は種が解禁済みならいつでも種ストアから可能(在庫確保の概念は不要)。ただしqueenbeetの植付(解禁必須)とSacrifice判定(34種すべて解禁)のみ解禁ベース。JQB格子の**開始**は事前種が確保済み(解禁or芽)なら可で、未収穫の芽(everdaisy等)の成熟中に格子の建設・育成を並走させる。

**P1: thumbcorn / bakeberry**
- 植付: bakerWheat @ (0..3, 1) と (0..3, 4) の8本
- 完了: thumbcorn 解禁または芽あり
- bakeberry(0.1%)は長引くため背景タスク(フィラー)扱い: レーンの空きマスに小麦を敷き続け、**bakeberryの芽が出た時点でフィラーを終了**して小麦を撤去する(芽は§8(c)で保護され、成熟時の収穫で解禁される。撤去で空いたマスはP3の雑草湧きに転用)。レーン2の配置は三本柱の有無で切り替える: **同居中**はrow 4奇数+row 3/5偶数の櫛形(有効変異マス6個)、**三本柱退役後**はrow 4全面に小麦6本+row 3/5全空け(**有効変異マス12個**)。いずれも部分適用なのでP9等がrow 3/5を要求したら自動で譲る

**P2: cronerice**
- 植付: レーン1: bakerWheat @ (0,1),(2,1) / thumbcorn @ (1,1),(3,1)
- bakeberryがcronericeより先に確保(解禁or芽)できた場合は、引退したフィラーの跡地=レーン2にも同構成を複製する: bakerWheat @ (0,4),(2,4) / thumbcorn @ (1,4),(3,4)(変異行はy=3,5のx0〜3)。cronericeは中盤チェーン(P6→P9)全体の律速であり、雑草はcronerice芽の成熟待ち74tick(両レーン撤収で盤面がほぼ空になる)に十分湧くため、複製を優先する
- 解禁後即: cronerice @ (0,4),(2,4),(4,4) に3本植えて放置育成(74tick≒肥料3.7h)。**以後、cronericeを親に使う3レシピ(gildmillet・elderwort・wardlichen)がすべて「解禁または芽あり」になるまでこの3本は撤去禁止**(全て確保されたら撤去し、レーン2をP12b等に明け渡す)
- 完了: cronerice解禁または芽あり(解禁後に3本植付)

**P3: brownMold / crumbspore(雑草)**
- **土は本フェーズ完了まで肥料固定**(ウッドチップは雑草-90%)
- ドロップ判定は「成熟したmeddleweedの収穫」時に樹齢×0.1%で発生し、播種した雑草と自然発生した雑草で差はない。よって2段構え:
  - **meddleweed未解禁の間(サイクル開始直後)**: x=4〜5列を予約(他フェーズ・フィラーの植付を禁止し、隣接植物ゼロの湧き場を最低6マス保証)して自然発生(0.2%/tick)を待つ。最初の1本の収穫でmeddleweed解禁
  - **meddleweed解禁後**: 湧き待ちをやめ、安全マス全部にmeddleweedを**播種**する(成熟4tick+樹齢84まで計6〜7tick≒20分でサイクル)。x4〜5の予約は解除し播種に使う
- 安全マス = 「植付予定マスでない」かつ「隣接8マスに雑草以外の植物・植付予定マスがない」マス。飼育(播種済み含む)はこの条件下で盤面のどこでも行い、樹齢84以上で`G.harvest`(次tickで寿命死のため84が上限目安)。条件を満たさない雑草(親・三本柱・育成中の芽に隣接など)は汚染5%/tick対策で即撤去
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
- 完了: elderwort解禁 → 即 elderwort @ (0,5)〜(5,5) に6本植付(常駐棚。成熟まで平均8h。**消費者であるichorpuff(P13)・everdaisy(P14)が両方「解禁or芽あり」になるまで撤去禁止**。両方確保されたら退役し、y=5をP15に明け渡す)

**P10: greenRot → keenmoss → wrinklegill ほか菌類**
順に消化。汚染分離形は汚染種を(0,0),(2,0),(4,0)、相方を(0,2),(2,2),(4,2)に置く(共有変異行はy=1の6マス。レーン1内で完結しレーン2と並走可)。
1. greenRot: whiteMildew @ (0,1),(2,1),(4,1) / clover @ (1,1),(3,1),(5,1) → 解禁
2. keenmoss: greenRot @ 偶数x / brownMold @ 奇数x(レーン1、両方非汚染なので標準形可)→ 解禁
3. wrinklegill: **汚染分離形** crumbspore @ (0,0),(2,0),(4,0) / brownMold @ (0,2),(2,2),(4,2) → 解禁
4. glovemorel: crumbspore @ (0,0),(2,0),(4,0) / thumbcorn @ (0,2),(2,2),(4,2) → 解禁
5. cheapcap: crumbspore @ (0,0),(2,0),(4,0) / shimmerlily @ (0,2),(2,2),(4,2) → 解禁
6. doughshroom: crumbspore @ (0,1),(2,1),(4,1) のみ(単種・0.5%。中央行なら上下2本の変異行が使えるため標準の親行に置く)→ 解禁
7. foolBolete: **汚染分離形** doughshroom @ (0,0),(2,0),(4,0) / greenRot @ (0,2),(2,2),(4,2) → 解禁
8. wardlichen: レーン2で cronerice(既設があれば流用、なければ@(0,4),(2,4),(4,4)) / whiteMildew @ (1,4),(3,4)(非汚染・標準形)→ 解禁
9. drowsyfern: chocoroot @ (0,1),(2,1),(4,1) / keenmoss @ (1,1),(3,1),(5,1) → 解禁

**P11: whiskerbloom → nursetulip → chimerose**
1. whiskerbloom: shimmerlily @ 偶数x / whiteChocoroot @ 奇数x(レーン1)。レーン2が空いていれば同構成を複製する(P11-1b: row 4に同配置、変異行はrow 3/5)
2. nursetulip: whiskerbloom @ (0..5,1) 単種
3. chimerose: shimmerlily @ 偶数x / whiskerbloom @ 奇数x
- 完了: 3種解禁

**P12: tidygrass**
- 植付: レーン1: bakerWheat @ 偶数x / whiteChocoroot @ 奇数x(0.2%と低率のため、レーン2が空いていれば同構成を複製)
- 完了: tidygrass解禁

**P13: ichorpuff**
- 植付: crumbspore @ (1,3),(3,3),(5,3)(row 3はどのxでも常駐棚と直交隣接しない)。変異マスはy=4行の全6マス(常駐棚y=5のelderwortとrow 3のcrumbsporeの両方に隣接)
- 前提: 常駐elderwort成熟済み
- 完了: ichorpuff解禁

**P14: everdaisy**
- 植付: tidygrass @ (0,3)〜(5,3) 6本(成熟80tick≒肥料4h)
- 変異マス: y=4行の(1,4)〜(4,4)(上にtidygrass3本+下に常駐elderwort3本)
- **補助(P14b)**: queenbeet確保済みでレーン1が空いていれば、elderwort @ (0,1)〜(5,1) を追加で育成。成熟すればy=2の行も変異マスになり抽選が倍増する(zoneは**ichorpuff未確保の間は全幅**(角もichorpuffの有効マスのため)、**確保後は内側x1〜4のみ**(everdaisyは角で成立しないため、角はCpSバックフィルに開放))。成熟に8h以上かかるため平均ケースでは本命が先に出るが、不運な尾とSacrifice後の周回で効く保険。この補助行は土制御の成熟判定から**除外**する(ウッドチップ切替を遅らせないため)。everdaisy確保後は通常の間引きで自動撤去
- 完了: everdaisy解禁 → tidygrass撤去

**P15: goldenClover(未解禁の場合のみ)**
- **評価順はP16a(queenbeet)より後**: queenbeet狩りは短期決戦で、芽が出た後の成熟待ち(67tick≒5.5h)がgoldenCloverの期待狩り時間とほぼ一致するため、その窓に本フェーズを流し込む(育成中のbakeberryを立ち退かせない)
- 盤面をクリア(elderwort棚はP13/P14の確保時点で退役済みのため、全6行を使える)
- 植付(clover、wiki配置フル版・0-indexed): (0,0),(1,0),(3,0),(5,0),(1,1),(3,1),(5,1),(0,2),(3,2),(5,2),(0,3),(2,3),(5,3),(0,4),(2,4),(4,4),(0,5),(2,5),(4,5),(5,5) の20マス
- 完了: goldenClover解禁

**P16: queenbeet → JQB格子(duketater / shriekbulb / queenbeetLump)**
1. queenbeet解禁: レーン1: bakeberry @ 偶数x / chocoroot @ 奇数x → 解禁
2. (5,5)の扱いは動的: **duketater未確保の間は第9の穴として開ける**(隣接3マスなのでduketater専用の抽選マス。未解禁duketaterが湧いて211tick居座っても最弱マスなので実害なし)。**duketater確保後はbakerWheatを植える**(穴としての価値がゼロになるため、成熟時CpS+1%のパッシブに転用。elderwortを置く案は、老化+3%が隣接queenbeetの寿命も縮めて同時成熟窓を削るため不採用)
3. **格子植付**: queenbeet を「x,yがともに奇数の9マス」**以外の27マス**に植付(コスト60分CpS/本のためバフガード厳守・分割植付可)。9マスのうち(5,5)はelderwortを維持し、残り8マスが変異穴。開始条件は「late3種以外の全種が確保済み(解禁or芽)かつqueenbeet解禁」で、everdaisy等の芽が残っていても建設を始める(芽のマスは収穫まで避け、空き次第埋める)
4. 変異穴の役割(自動判定不要、抽選は勝手に回る): ⑧=(1,1),(3,1),(1,3),(3,3)→JQB0.1%、⑤=(5,1),(5,3),(1,5),(3,5)→shriekbulb0.1%、全穴→duketater0.1%((5,5)開放中は9個目のduketater穴が加わる)
5. duketater/shriekbulbが未解禁のうちは湧いたら成熟まで待って収穫(解禁)。解禁済みなら即撤去してマスを空け直す。**同種の未解禁の芽が複数ある場合、最年長の1本だけを残し、他は場所を問わず間引く**(解禁に必要なのは1本の成熟収穫だけ。重複を除けばJQB穴・shriekbulb穴が早く抽選に戻る)
6. **JQBが湧いたら**: 成熟まで平均1063tick。育成中は土を肥料に固定(§8)。隣接QBが枯れたマスにelderwortを植えて老化+3%/本を付与(最大8本)。**樹齢85以上100未満で必ず`G.harvest`**(自然死はランプなし)。収穫でランプ+1+種解禁
7. **グリッドの引退**: JQBが育成中かつduketater/shriekbulb確保済みになったら、残りのqueenbeetの植え直しを停止する(リングのelderwortは他の全JQB穴とマスを共有するため第2のJQBは湧けず、⑤穴の産出物もゴミになるため)。残存株は成熟した時点で収穫して収穫益(1時間分CpS)を回収し、**空いたマスと穴にはbakerWheatを植える**(成熟でCpS+1%/本。最終的にJQB+リング以外の全マスが小麦になり、JQB収穫までの間+30%前後のCpSパッシブになる)
8. **queenbeetの世代同期**: 成熟窓が寿命83tick中17tickしかなく、穴は5〜8本の同時成熟を要求するため、個別の枯死ごとの植え直しは位相ズレで抽選を殺す。(a)世代の中央値樹齢が20を超えた後に空いたマスは**次世代まで植えない**(遅植えは同世代の枯死前に成熟できない。中央値20以下の序盤の欠員は今植えてもコホートに合流できるため即補充する)、(b)**世代の中央値樹齢から±20超ズレた株は外れ値として即刈る**(成熟窓の幅=樹齢80〜100の20なので、コホートと同時成熟が数学的に不可能。同期導入前の混在世代もこれで収束する)、(c)世代の過半が枯れたら生き残りを刈って**全マス同時に植え直す**
- 完了: queenbeet / duketater / shriekbulb / queenbeetLump 解禁

**P17: Sacrifice**
- 条件: `G.plantsUnlockedN === 34` かつ **盤面にJQBが残っていない**(残っていれば収穫を待ってから)。実行可否は設定`autoGarden`(§10)で制御: 1=自動Sacrifice、2=通知のみ出して待機
- 動作: `G.askConvert()` → `Game.ConfirmPrompt()` → ランプ+10、種ログ初期化 → P1へ戻る

**フェーズ復帰**: 起動時は解禁済み種の集合と盤面(芽の有無)から「未完了のフェーズ群」を再導出して再開する(P1→P17の順で完了条件を評価。マスが競合しないフェーズは並走する)。

## 8. 共通ポリシー

- **tick同期**: 盤面の判定・間引き(収穫・撤去)は`G.nextStep`の変化を検知した直後の1回だけ実行(前回処理済みtickを記録)。植付は空きマスに対して毎パス(5秒間隔)試行する(バフ解除や資金回復を待たずに反映するため)。
- **間引き分類**: 各マスを毎処理で分類する。(a)アクティブフェーズの親座標にある指定種→維持、(b)常駐棚・育成中cronerice・JQB→維持、(c)未解禁種(**場所を問わず**)→成熟まで維持し、成熟したら`G.harvest`(種解禁)。この保護がフェーズ完了判定「解禁or芽あり」(§7)の前提、(d)解禁済み種・雑草・ゴミで配置指定と一致しないもの→即撤去。
- **土制御**: P3完了まで肥料固定。**JQB育成中も肥料固定**(肥料3分tickはウッドチップ5分tickより実時間で約1.7倍速く熟すため)。それ以外は「**どれか1つでもレシピが抽選稼働中→ウッドチップ / それ以外→肥料**」。抽選稼働中とは、**実際の抽選成立マスが存在する**こと — すなわち「隣接8マスに各親種の必要数(既定1本、goldenClover=clover×4、doughshroom=crumbspore×2、nursetulip=whiskerbloom×2、thumbcorn/bakeberry=wheat×2)の成熟株が同時に揃っている空きマス」が盤面に1つでもあること。成熟株の合計本数ではなく配置で判定する(散在する成熟4本では成立しない)。ウッドチップは抽選側に実時間×1.8の利得、肥料は育成側に×1.67の利得なので、抽選が1つでも回っていればウッドチップが総合的に優る。ただし**未解禁のelderwortの芽が盤面にいる間は肥料を維持**する(elderwortの解禁だけが後続の建設(棚→P13/P14)を直接ゲートするため。everdaisy・drowsyfern等の遅い芽は最終Sacrificeしかゲートせず、SacrificeはJQB待ちで律速されるので、抽選側のウッドチップ×1.8を優先する。グリッド中はこの例外を適用しない)。切替は`Date.now() >= G.nextSoil`のときのみ(10分CD)。
- **植付ガード**: CpS増加系バフ(`multCpS > 1`のバフ)がない時のみ植付(かつ`G.canPlant(plant)`)。種コストは現在CpS基準のため、高騰するのはFrenzy・Building Special等のみ。Clot・Cursed Fingerなどのデバフ中はむしろ割安、クリック系バフはコストに無関係なので植付を許可する。ガード中の植付は次パスへ持ち越し。
- **レーン振替(lane switch)**: レーン1基準(row 0〜2)で定義された標準形・汚染分離形のフェーズは、**全座標を上下鏡映(y→5−y)してレーン2(row 3〜5)で実行**できる(鏡映にすることで汚染分離形のキノコが外縁のrow 5に来て、反対レーンの変異行と直交しない)。レーン選択は「予約が空いている」候補のうち、第一に**自分の親が既に植わっているマス数が多い側(粘着性 — 選択が毎パス反転して両レーンに植える事故を防ぐ)**、第二に「他のアクティブフェーズの縄張り(親マス+貸出中含む変異行)との重なりが最少」、第三に「植えられないマス(保護中の芽の占有+汚染ガードで植付不可)が最少」の側。さらに配置決定後、**塞がれた親マスは左右±1マスへ個別に回避**する(汚染分離形は行の距離だけが幾何条件のため、列は±1ずれても変異ペアが成立する。回避先も塞がっていれば元のマスのまま欠員となる)。例えばgreenRot予定地にdrowsyfernの芽(成熟300tick)が居座った場合、レシピ全体がレーン2へ移って親6本のフル構成で継続する。レーン2固有のフェーズ(P6/P9/P10-8)と盤面全体系(P13〜P16)は固定のまま。
- **変異行の遅延予約(lazy zone)**: 親の一部が植付保留中のフェーズは変異が起こり得ないため、変異行(zone)を予約しない。後続フェーズやフィラーがその間も変異行で作業を続けられる(例: P10-7のdoughshroomが42tick育つ間、row 1でwhiskerbloom狩りが継続する)。保留解除と同時にzoneを予約し、間借りフェーズは数tickの猶予をもって自動退去する。
- **短命親の植え直し抑制**: 変異は両親が同時に成熟している必要があるため、フェーズ内の相方種の「成熟までの残りtick」を平均老化速度で見積もり、「相方成熟時の自身の樹齢が70超」になる植付は保留する(例: cronerice育成中のP6 thumbcornは成熟の約9tick前まで、doughshroom育成中のP10-7 greenRotは成熟の約4tick前まで植えない)。相方の残り時間は**種ごとにmin**で評価する(その種のどれか1本が成熟していれば抽選は回るため、三本柱の1本だけを植え直した場合などに過剰保留しない)。常駐枠(三本柱・棚)の植付は対象外。
- **同種複数親の世代同期**: 同種複数の同時成熟が必要なレシピ(P10-6 doughshroom=crumbspore M×2、P11-2 nursetulip=whiskerbloom M×2、**P15 goldenClover=clover M×4** — ×4は位相ズレの影響が4乗で効き、同期で実効レート約3.4倍)では、個別死のたびに植え直すと世代の位相がズレ、「新株が熟す頃に生き残りが枯れる」逆位相ロックでペア成熟がほぼ発生しなくなる(crumbsporeの成熟窓は寿命22tick中8tickのみ)。よってこれらのフェーズは個別の植え直しをせず、**グループ全滅を待って全員同時に植え直す**(同世代の枯死は±2tick程度に収まるため全滅待ちのロスは小さい)。ただし空きマスの保留は「最年長の生存メンバーが合流不能ライン(樹齢 > 100−成熟値−5)を超えてから」とし、一斉植えの植付漏れ(資金・バフ等による数tickの遅れ)はコホートが若いうちに補充する。クロス種レシピ(P10-3等)は同期不要のため従来どおり個別に植え直す。
- **汚染ガード**: crumbspore/doughshroom/meddleweedを、指定座標以外(特に常駐棚の直交隣接)に置かない。これらが自己増殖・汚染で指定外マスに現れたら即撤去。ただしP3中のmeddleweedのみ、P3の安全条件を満たすマスに限り樹齢84まで飼育する。さらに**保護中の芽(未解禁種、汚染免疫のcrumbspore/doughshroom自身を除く)に直交隣接するマスにはcrumbspore/doughshroomを植えず、既に植わっていれば撤去する**(例: row 3に湧いたtidygrassの芽をP13のcrumbsporeが挟むと3%×2/tickで80tick生存率約1%になるため。芽の収穫後に親は自動で復帰する)。
- **重複芽の間引き(盤面全域)**: 同種の未解禁の芽が複数あるときは最年長の1本だけを残し、他は間引く(解禁に必要なのは1本の成熟収穫だけで、同齢の重複は成熟窓も共有するため保険価値もない)。meddleweed(P3で複数飼育する)とqueenbeetLumpは対象外。
- **JQB特別則**: queenbeetLumpは撤去対象に絶対含めない。収穫は樹齢85〜99のみ。
- **ログ**: 操作履歴は配列(`window.gardenBotLog`、最大500件)とFCの`logEvent`へ(console出力はFCのlogging設定に従う)。
- **CpSバックフィル**: どのフェーズ・常駐枠・変異行・雑草も要求していないマスには、最低優先でbakerWheatを植える(成熟でCpS+1%/本)。実フェーズがマスを要求したら即退去。P3(雑草シーズン)中は空きマス自体が資源のため行わない。
- **状態確認**: コンソールで`gardenBotStatus()`を実行すると、アクティブなフェーズとマスごとの状態(mature/growing/deferred/empty/squatted)・**常駐枠とフィラー(棚・三本柱・CpS小麦・雑草播種など、`fixtures`として所有者別に表示。大きなグループは種別×状態の集計に要約)**・保護中の芽・土・解禁数を一覧できる(読み取り専用)。
- **停止**: `window.gardenBotEnabled = false`で全動作停止。フリーズ機能は使用しない。

## 9. 既知の設計判断(コード側で変更可)

- Everdaisyはwikiの9マス織り込み配置ではなく、常駐棚を活かした4マスサンド構成を採用(配置転記ミスの回避と常駐elderwortの再利用を優先。0.2%×3倍×4マス≒期待42tickで実用十分)。
- goldenCloverのwiki配置はフル版20マスを使用(elderwort棚はP13/P14確保時点で退役するため、P15実行時にはy=5が空いている)。
- shriekbulbはJQB格子の⑤マスで受動的に取る(専用フェーズなし)。duketater単独フェーズも同様に不要。
- bakeberry(0.1%)はP1を長引かせる主因のため、レーンが空いている間は小麦を敷き続けるフィラーとして実装(P2〜P12の任意の空きレーンで並走)。芽が出た時点で引退し、マスを雑草湧き・後続フェーズに譲る。
- **フェーズ完了判定は「解禁 or 盤面に芽あり」**: 芽は§8(c)で収穫まで保護されるため、変異が出た時点で親マスを解放して次レシピに進む。転生の`harvestAll`等で芽を収穫前に失うとフェーズ再開+親の植え直しコストが生じるが、drowsyfern(成熟約300tick)・everdaisy(約250tick)の成熟待ち中にレーンを遊ばせない利得を優先。queenbeetの植付可否とSacrifice判定のみ解禁ベース(グリッド開始は確保ベース)。
- 雑草の飼育は固定ゾーンでなく盤面全域の安全マスで行う(x4〜5は湧き場の最低保証として予約のみ継続)。
- JQB格子は27マス植付(旧版の「26マス」は計算誤り: 36−変異穴8−(5,5)elderwort=27)。
- 種解禁の通知はバニラ自身がポップアップを出すため、`Game.Notify`はSacrifice・JQB収穫・検証モードの34種到達のみに使用(解禁は`logEvent`のみ)。

## 10. FrozenCookies組み込み仕様

- **モジュール**: 新規ファイル`fc_garden.js`。ローダー(`frozen_cookies.js`および各loader)の読み込みリストへ追加。庭参照はfc_main.jsの既存グローバル`G`を流用(`if (!G) G = Game.Objects["Farm"].minigame`の再取得パターンも踏襲)。
- **スケジューリング**: `FCStart()`内で `if (FrozenCookies.autoGarden) FrozenCookies.gardenBot = setInterval(autoGarden, 5000);`。**必須**: `FCStart`冒頭のボット停止処理に`gardenBot`を追加する(`clearInterval(FrozenCookies.gardenBot); FrozenCookies.gardenBot = 0;`)。既存の`frenzyClickBot`/`autoFrenzyBot`が停止リストに未登録のまま設定OFFですり抜けるバグがあるため、同型のガード漏れを作らないこと(可能なら当該バグも同時に修正)。
- **設定**: `fc_preferences.js`に3値設定`autoGarden`を追加 — 0: OFF / 1: ON(Sacrificeまで全自動ループ) / 2: 検証モード(34種到達でSacrificeせず通知して待機)。§7 P17の実行可否はこの設定値で制御する。
- **通知・ログ**: Sacrifice実行・JQB収穫・検証モードの34種到達は`Game.Notify`。種の解禁はバニラが通知するため`logEvent`のみ。通常の植付・間引きもFCの`logEvent`へ(console出力はFCのlogging設定に従う)。
- **状態管理**: フェーズは毎回、解禁済み種の集合と盤面から再導出する(ステートレス)。永続化する独自状態は持たない。これにより転生(`fcReset`の`harvestAll`)・リロード・設定OFF→ONのいずれからも自動復帰する。
- **干渉制約**:
  - 100% Consistency Combo(fc_spells.js)は全収穫+Whiskerbloom全面植えで盤面を破壊するため、`autoGarden`有効中はコンボの庭ステップをスキップする(または設定を相互排他にする)。
  - Harvesting Bank系設定とは読み取り共存(本機能はリザーブ計算に関与しない)。
  - 本機能はFCのランプ自動収穫(`autoSL`)・Dragon's Curveスワップとは独立(庭のJQB収穫はランプ収穫APIと無関係)。

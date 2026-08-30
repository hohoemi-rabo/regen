/* eslint-disable @next/next/no-img-element --
   Workersでは next/image の既定ローダーが動かないので、図版は public/ の静的アセットを
   素の <img> + 明示的な width/height で出す(CLAUDE.md「Workers固有の制約」)。 */
import type { Metadata } from "next";
import Link from "next/link";
import {
  CO2,
  DEFAULT_EV,
  MAX_GRADE,
  PRICE,
  SMOOTH_W,
  STEP,
  SUMMER_AUX_W,
  WINTER_AUX_W,
  cruiseSpeedKmh,
} from "@regen/core";
import { getCurrentBundle, getThresholds, listFeeds, listRoutes } from "@/lib/data";
import { StatTile } from "@/app/_components/StatTile";
import { VerdictChip } from "@/app/_components/VerdictChip";
import { formatInt, formatKm, formatNumber } from "@/lib/format";
import { DefinitionRow } from "@/app/routes/[id]/_components/sections";
import { Figure, SvgFigure } from "./_components/Figure";
import { PipelineDiagram } from "./_components/PipelineDiagram";

export const metadata: Metadata = {
  title: "このサービスについて | Regen",
  description:
    "Regenがどのデータを使い、どう計算し、どこまで信用してよいかの説明。路線バスのEV化適性を公共交通オープンデータと国土地理院の標高データだけで診断する手法・仮定・出典をまとめています。",
  openGraph: {
    title: "このサービスについて | Regen",
    description: "Regenの診断手法・仮定・出典・限界。",
  },
};

/** 診断値はバッチ更新のときしか変わらない */
export const revalidate = 3600;

const REPO = "https://github.com/hohoemi-rabo/regen";

/** 節見出し。目次から飛べるようにidを持たせる */
function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-10 scroll-mt-16 border-b border-line pb-2 text-page-title">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 text-section">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-prose text-ink-1">{children}</p>;
}

const TOC = [
  { id: "what", label: "このサービスは何か" },
  { id: "how-to-use", label: "使い方" },
  { id: "method", label: "どうやって診断しているか" },
  { id: "limits", label: "精度と限界" },
  { id: "assumptions", label: "使っている仮定" },
  { id: "sources", label: "出典とライセンス" },
  { id: "disclaimer", label: "免責とソース" },
];

export default async function AboutPage() {
  const [routes, bundle, feeds, th] = await Promise.all([
    listRoutes(),
    getCurrentBundle(),
    listFeeds(),
    getThresholds(),
  ]);

  // 数字はD1から出す。ページに直書きすると、バッチが更新したときに黙って古くなる
  const counts = routes.reduce<Record<string, number>>((a, r) => {
    a[r.verdict] = (a[r.verdict] ?? 0) + 1;
    return a;
  }, {});
  const rankA = routes.filter((r) => r.accuracy === "A").length;
  const corrected = routes.filter((r) => r.correctedM > 0);
  const correctedM = corrected.reduce((n, r) => n + r.correctedM, 0);
  const agencies = new Set(routes.map((r) => r.agency)).size;
  const generatedAt = bundle ? new Date(bundle.createdAt + 9 * 3600_000).toISOString().slice(0, 10) : null;
  const usableKwh = DEFAULT_EV.batteryKwh * DEFAULT_EV.usableRatio;
  // 標高を貼る点の数は路線長 ÷ サンプリング間隔。文章に書き写さず実データから出す
  const lengths = routes.map((r) => r.lengthM);
  const minPoints = Math.round(Math.min(...lengths) / STEP) + 1; // 端点を含む
  const maxPoints = Math.round(Math.max(...lengths) / STEP) + 1;
  // 発行者は名前で重ねる(飯田市のように1者で2フィードを出しているところがある)
  const publishers = [...new Map(feeds.map((f) => [f.name, f])).values()];

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-8">
      <h1 className="text-page-title">このサービスについて</h1>
      <p className="mt-2 text-prose text-ink-2">
        Regenが<strong>どのデータを使い、どう計算し、どこまで信用してよいか</strong>の説明です。
        操作の説明書というより、数字の出どころの説明書だと思ってください。
      </p>

      <nav aria-label="目次" className="mt-5 rounded-card border border-line bg-surface p-4">
        <p className="text-note text-ink-2">目次</p>
        <ol className="mt-2 space-y-1 text-aux">
          {TOC.map((t, i) => (
            <li key={t.id}>
              <a href={`#${t.id}`} className="text-accent hover:text-accent-strong">
                {i + 1}. {t.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* 1 ------------------------------------------------------------------ */}
      <H2 id="what">1. このサービスは何か</H2>
      <P>
        路線バスを電気バスに置き換えられるかを、<strong>路線ごとに数字で答える</strong>サービスです。
        地方の事業者は車両更新のたびに数千万円の判断を迫られますが、EVバスの電費は勾配と冬の暖房で
        大きく変わるため、平地の導入事例が山間地の参考になりません。実車を借りて試すにも手間と費用がかかります。
      </P>
      <P>
        判断に要る材料は、実はすでに公開されています。路線の正確な形は GTFS の shapes.txt に、
        地形は国土地理院の標高タイルにあります。Regen はこの2つを重ねて、
        南信州の全{routes.length}路線を自動で診断しました。
      </P>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatTile label="診断した路線" value={String(routes.length)} unit="路線" hint={`${agencies}事業者・${feeds.length}フィード`} />
        <StatTile label="判定" value={`${counts["適"] ?? 0} / ${counts["条件付き"] ?? 0} / ${counts["要検討"] ?? 0}`} hint="適 / 条件付き / 要検討" />
        <StatTile label="実形状で診断" value={String(rankA)} unit="路線" hint={`残り${routes.length - rankA}路線は停留所を結んだ近似`} />
        <StatTile label="地形を補正した路線" value={String(corrected.length)} unit="路線" hint={`合計 ${formatKm(correctedM / 1000)} km`} />
      </div>

      <H3>できないこと</H3>
      <P>
        先にはっきりさせておきます。これは<strong>オープンデータだけで出した一次診断</strong>であり、
        実車で測った値ではありません。次のことはできません。
      </P>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-prose text-ink-1">
        <li>
          <strong>実際の電費を保証すること。</strong>運転の仕方・乗車率・路面・気温・車両個体差は
          モデルに入っていません。手元の運行実績があれば
          <Link href="/calibrate" className="font-semibold text-accent hover:text-accent-strong">
            じぶん補正
          </Link>
          で係数を合わせられます。
        </li>
        <li>
          <strong>充電器の設置計画を立てること。</strong>「日中に何回充電が要るか」までは出しますが、
          充電時間・充電器の出力・停車場所は含みません。
        </li>
        <li>
          <strong>補助金や採算の可否を判断すること。</strong>車両比較のTCOは車両価格・補助金・
          エネルギー費だけの単純な積み上げで、整備費・充電器設置費・人件費・税保険を含みません。
        </li>
      </ul>

      {/* 2 ------------------------------------------------------------------ */}
      <H2 id="how-to-use">2. 使い方</H2>
      <P>
        地図で地域を眺め、気になる路線の診断書を開き、車両を変えて試し、条件を保存して人に渡す —
        という流れです。登録は要りません。
      </P>

      <H3>① 地図で地域全体を見る</H3>
      <P>
        トップページに{routes.length}路線が判定の色で出ます。
        <VerdictChip verdict="適" className="mx-1" />は冬の往復でも電池
        {th.fitBattPct}%未満かつ最急勾配{formatNumber(th.fitMaxGrade * 100, 1)}%未満、
        <VerdictChip verdict="条件付き" className="mx-1" />は電池{th.fitBattPct}〜{th.condBattPct}%
        または急勾配あり、<VerdictChip verdict="要検討" className="mx-1" />は電池{th.condBattPct}%以上です。
        判定は色だけでなく記号とラベルでも示しています。
      </P>
      <SvgFigure caption={`南信州${routes.length}路線をEV適性で色分けした図。緑が「適」、アンバーが「条件付き」。`}>
        <img
          src="/about/map.svg"
          alt={`南信州の${routes.length}バス路線を判定で色分けした地図。緑が適、アンバーが条件付き。`}
          width={820}
          height={838}
          className="mx-auto block h-auto w-full max-w-[560px]"
        />
      </SvgFigure>

      <H3>② 路線の診断書を読む</H3>
      <P>
        路線を選ぶと診断書が出ます。結論(冬の往復バッテリー使用率)が最初にあり、
        その下に標高プロファイル・電費・回生の回収量・充電計画・ディーゼル車との比較が続きます。
        <strong>この画面で使った仮定はすべて同じ画面の下に並べてあります</strong>。
      </P>
      <Figure
        src="/about/sheet.png"
        alt="診断書の画面。上に結論バッジ、下に標高プロファイルと数値タイルが並んでいる。"
        caption="路線診断書。結論を最初に、根拠をその下に置いています。"
        width={1440}
        height={900}
      />

      <H3>③ 車両を変えて試す</H3>
      <P>
        車両比較では、車種・電池容量・車両重量・空調・単価を動かしてその場で計算し直します。
        ブラウザの中で計算しているので、動かした瞬間に数字が変わります。
        累計コストの折れ線が交わる年({PRICE.dieselKmPerL} km/Lのディーゼル車との損益分岐)も出ます。
      </P>
      <Figure
        src="/about/compare.png"
        alt="車両比較の画面。共通条件のスライダーと、車両A・Bの結果とTCOグラフ。"
        caption="車両比較。仮定を動かすと即座に再計算されます。"
        width={1440}
        height={900}
      />

      <H3>④ 条件を保存して渡す</H3>
      <P>
        比較画面で作った条件は短いURLとして保存できます。開くと同じ数字が再現され、
        <strong>あとから車両マスタや診断データが更新されても、そのページの数字は変わりません</strong>。
        補助金申請や社内説明にそのまま添付できるよう、A4縦1枚で印刷できます。
      </P>

      <H3>⑤ 実測データで精度を上げる</H3>
      <P>
        手元に運行実績(デジタコ・給油記録・充電記録)があれば、
        <Link href="/calibrate" className="font-semibold text-accent hover:text-accent-strong">
          じぶん補正
        </Link>
        にCSVを読み込ませると、車両効率と空調負荷の係数がその事業者向けに補正されます。
        <strong>CSVはサーバーに送りません。</strong>読み取りも計算もブラウザの中だけで完結し、
        結果の係数だけがその端末に残ります。
      </P>
      <Figure
        src="/about/calibrate.png"
        alt="じぶん補正の画面。CSVのドロップゾーンと、送信されない旨の表示。"
        caption="じぶん補正。CSVをサーバーに送る経路をそもそも実装していません。"
        width={1440}
        height={900}
      />

      {/* 3 ------------------------------------------------------------------ */}
      <H2 id="method">3. どうやって診断しているか</H2>
      <P>
        使うデータは2つだけです。<strong>GTFS</strong>から路線の形・停留所・時刻表を、
        <strong>国土地理院の標高タイル</strong>から地形を取ります。あとは物理の式です。
      </P>

      <SvgFigure caption="診断の処理の流れ。左の2つが入力、右下の2つが出力です。">
        <PipelineDiagram />
      </SvgFigure>

      <P>順に説明します。</P>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-prose text-ink-1">
        <li>
          <strong>{STEP}m にリサンプル。</strong>GTFSの形状点は間隔がまちまちなので、
          経路を{STEP}m間隔に刻み直します。以降はすべてこの粒度で扱います。
        </li>
        <li>
          <strong>標高を貼る。</strong>各点の緯度経度から、標高タイル(ズーム14)の4隅を
          双線形補間して標高を出します。点の数は路線の長さで決まり、
          いまは{formatInt(minPoints)}〜{formatInt(maxPoints)}点です。
        </li>
        <li>
          <strong>{SMOOTH_W * STEP}m 移動平均。</strong>タイルの粒度に由来するギザギザを均します。
          ここを飛ばすと、実在しない細かい上り下りが積み上がって電費が過大に出ます。
        </li>
        <li>
          <strong>地形の補正。</strong>次節で詳しく書きます。標高タイルは地表のモデルなので、
          そのままではトンネルの上の山を拾ってしまいます。
        </li>
        <li>
          <strong>エネルギーの積算。</strong>{STEP}m区間ごとに、転がり抵抗・空気抵抗・勾配抵抗を
          足した力を出し、距離を掛けて仕事にします。正なら力行(駆動効率で割る)、
          負なら回生(回生効率を掛けて回収)です。<strong>下り坂が電池に戻る</strong>のがEVの特徴で、
          この分がディーゼル車には原理的に存在しません。
        </li>
        <li>
          <strong>空調を足す。</strong>走行時間 × 空調電力(夏{SUMMER_AUX_W / 1000}kW /
          冬{WINTER_AUX_W / 1000}kW)を加えます。<strong>判定は冬を基準</strong>にしています。
          暖房は電気バスにとって一番きつい条件だからです。
        </li>
        <li>
          <strong>充電計画。</strong>朝の満充電から出庫し、便ごとに片道電力量を引いていきます。
          電池{DEFAULT_EV.batteryKwh}kWhのうち使えるのは
          {Math.round(DEFAULT_EV.usableRatio * 100)}%の{formatInt(usableKwh)}kWhとし、
          次の便を走ると下回る時点を充電のタイミングとして出します。
        </li>
      </ol>

      {/* 4 ------------------------------------------------------------------ */}
      <H2 id="limits">4. 精度と限界</H2>
      <P>
        ここがこのページで一番読んでほしい節です。<strong>数字がどこで甘くなるか</strong>を書きます。
      </P>

      <H3>精度ランク A と B</H3>
      <P>
        GTFSに <code className="text-aux">shapes.txt</code>(路線の実際の形)が入っているかどうかで、
        診断の土台が変わります。{routes.length}路線のうち<strong>{rankA}路線がランクA</strong>で、
        実際の道路形状に沿って標高を取っています。
      </P>
      <P>
        残り{routes.length - rankA}路線は <code className="text-aux">shapes.txt</code> が無く、
        <strong>停留所を順に結んだ近似形状</strong>で診断しています(ランクB)。直線は実際の道路を
        通らないので、停留所の地点の標高だけを信じて、その間は直線で補間しています。
        つまり<strong>ランクBは実際の起伏より緩やかに出ます</strong> —
        登り坂を見落とす方向、すなわち<strong>実際より良い判定が出る方向</strong>に偏ります。
        診断書には路線ごとにランクを明示しています。
      </P>

      <H3>トンネルと高架の補正</H3>
      <P>
        標高タイルは<strong>地表の高さのモデル</strong>です。バスがトンネルを通っていても、
        タイルはその上の山の高さを返します。実際、信南交通E1遠山郷線では矢筈トンネル(約4.1km)の
        区間が地表の1,561mとして読まれ、存在しない最大69.9%の急勾配が出ました。
      </P>
      <P>
        そこで、<strong>勾配{MAX_GRADE * 100}%を超えないと到達できない標高</strong>を
        前後の両方向から削る処理を入れています。バス路線として物理的にありえない登り方を
        「そこは地表ではなく構造物だ」とみなす考え方です。緩やかに登って到達する実在の峠
        (治部坂峠1,196mなど)は削られずに残ります。
      </P>
      <P>
        この処理が働いたのは<strong>{corrected.length}路線・合計{formatKm(correctedM / 1000)}km</strong>
        でした。補正した区間は診断書の標高グラフに帯と破線で表示しています —
        <strong>どこを直したか隠さない</strong>ためです。なおランクBにはこの補正を掛けないので、
        ランクBの路線で補正量が0なのは「補正が要らなかった」ではなく「見ていない」という意味です。
      </P>

      <H3>便数の数え方が2通りある</H3>
      <P>
        GTFSの便は平日・土日祝などダイヤ種別ごとに入っています。一覧とマップの日次電力量・
        追加充電回数は<strong>全ダイヤの合計便数</strong>で計算した上限値です。
        一方、診断書の充電計画は<strong>実際に1日で走る代表運行日</strong>(最も便数の多い曜日)の
        時刻表で出しています。両者が食い違う路線では診断書にその旨を書いています。
      </P>

      <H3>そもそも一次診断であること</H3>
      <P>
        車両スペックはメーカー公表値と一般的な既定値の組み合わせです。CdA・転がり抵抗・駆動効率・
        回生効率は<strong>どのメーカーも公表していない</strong>ため、全車で同じ既定値を使い、
        その旨を画面に出しています。運転の仕方も乗車率も入っていません。
      </P>
      <P>
        だからこそ<strong>実測で補正する仕組み</strong>を用意しています。手元の運行実績を
        読み込ませれば、推定モデルの係数がその事業者の実力値に近づきます。
        オープンデータで一次診断し、自社データで精度を上げる — この二段構えが設計の中心です。
      </P>

      {/* 5 ------------------------------------------------------------------ */}
      <H2 id="assumptions">5. 使っている仮定</H2>
      <P>
        下の値はすべて<strong>コードから直接読んで表示しています</strong>。
        文章として書き写していないので、計算に使っている値とこの表がずれることはありません。
      </P>
      <dl className="mt-4">
        <DefinitionRow label="車両総重量" value={`${formatInt(DEFAULT_EV.massKg)} kg`} />
        <DefinitionRow label="前面投影面積 × 空気抵抗係数(CdA)" value={`${DEFAULT_EV.cda} m²`} />
        <DefinitionRow label="転がり抵抗係数" value={String(DEFAULT_EV.crr)} />
        <DefinitionRow label="駆動効率" value={`${Math.round(DEFAULT_EV.driveEff * 100)} %`} />
        <DefinitionRow label="回生効率" value={`${Math.round(DEFAULT_EV.regenEff * 100)} %`} />
        <DefinitionRow
          label="電池容量"
          value={`${DEFAULT_EV.batteryKwh} kWh(使用可能 ${Math.round(DEFAULT_EV.usableRatio * 100)}% = ${formatInt(usableKwh)} kWh)`}
        />
        <DefinitionRow label="表定速度" value={`${cruiseSpeedKmh(20000)} km/h(路線長10km未満は ${cruiseSpeedKmh(1000)} km/h)`} />
        <DefinitionRow label="空調" value={`夏 ${SUMMER_AUX_W / 1000} kW / 冬 ${WINTER_AUX_W / 1000} kW`} />
        <DefinitionRow label="サンプリング間隔" value={`${STEP} m`} />
        <DefinitionRow label="平滑化の窓" value={`${SMOOTH_W * STEP} m(${SMOOTH_W}点移動平均)`} />
        <DefinitionRow label="勾配上限(補正しきい値)" value={`${MAX_GRADE * 100} %`} />
        <DefinitionRow label="単価" value={`電力 ${PRICE.yenPerKwh} 円/kWh / 軽油 ${PRICE.yenPerLiterDiesel} 円/L`} />
        <DefinitionRow label="ディーゼル比較車の燃費" value={`${PRICE.dieselKmPerL} km/L(山岳走行)`} />
        <DefinitionRow label="CO2排出係数" value={`軽油 ${CO2.dieselKgPerL} kg/L / 電力 ${CO2.gridKgPerKwh} kg/kWh`} />
        <DefinitionRow
          label="判定のしきい値"
          value={`適: 電池 ${th.fitBattPct}% 未満 かつ 勾配 ${formatNumber(th.fitMaxGrade * 100, 1)}% 未満 / 要検討: 電池 ${th.condBattPct}% 以上`}
        />
      </dl>
      <p className="mt-3 text-note text-ink-3">
        CO2係数の出典: 軽油は温対法 算定・報告・公表制度の標準値、系統電力は電気事業者別排出係数の
        全国平均相当。どちらも診断書にも表示しています。
      </p>

      {/* 6 ------------------------------------------------------------------ */}
      <H2 id="sources">6. 出典とライセンス</H2>
      <dl className="mt-4">
        <DefinitionRow label="路線・停留所・時刻表・形状" value="GTFSデータリポジトリ(gtfs-data.jp)" />
        <DefinitionRow label="対象フィード" value={`南信州 ${feeds.length} フィード / ${agencies} 事業者`} />
        <DefinitionRow label="標高" value="国土地理院 標高タイル(10mメッシュ・ズーム14)" />
        <DefinitionRow label="地図の下地" value="国土地理院 淡色地図タイル" />
        <DefinitionRow label="車両スペック" value="メーカー公表カタログ値からの自作マスタ" />
        {bundle && <DefinitionRow label="診断データの版" value={bundle.version} />}
        {generatedAt && <DefinitionRow label="生成日" value={generatedAt} />}
      </dl>
      <P>データの提供元へのリンクです。</P>
      <ul className="mt-2 space-y-1 text-body">
        <li>
          <a href="https://gtfs-data.jp/" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:text-accent-strong">
            GTFSデータリポジトリ(gtfs-data.jp)
          </a>
        </li>
        <li>
          <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:text-accent-strong">
            地理院タイル(国土地理院)
          </a>
        </li>
      </ul>

      <P>フィードの発行者は次の{publishers.length}者です。</P>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-aux text-ink-2">
        {publishers.map((f) => (
          <li key={f.name}>
            <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-strong">
              {f.name}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-note text-ink-3">
        各フィードの利用条件は提供元(gtfs-data.jp の各フィードのページ)に従います。
        データは週次で自動取得し、更新があったときだけ診断をやり直しています。
      </p>

      {/* 7 ------------------------------------------------------------------ */}
      <H2 id="disclaimer">7. 免責とソース</H2>
      <P>
        本サービスの数値は<strong>公開データに基づく試算</strong>であり、実車の性能・運用コストを
        保証するものではありません。車両の導入判断にあたっては、必ず実車のデータやメーカーの
        提示値と突き合わせてください。本サービスの利用によって生じた損害について、
        制作者は責任を負いません。
      </P>
      <P>
        ソースコードと計算式はすべて公開しています。診断エンジンは46路線の結果を固定した
        回帰テストつきで、計算を変えたら結果が変わることを検知できるようにしてあります。
        誤り・改善のご指摘は GitHub の Issues でお願いします。
      </P>
      <div className="mt-4 flex flex-wrap gap-4 text-body">
        <a href={REPO} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:text-accent-strong">
          ソースコード(GitHub)
        </a>
        <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:text-accent-strong">
          誤りを報告する(Issues)
        </a>
      </div>

      <p className="mt-8 text-note text-ink-3">
        Regen は公共交通オープンデータチャレンジ2026の応募作品です。
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
        <Link href="/" className="text-body font-semibold text-accent hover:text-accent-strong">
          ← EV適性マップへ
        </Link>
        <Link href="/routes" className="text-body font-semibold text-accent hover:text-accent-strong">
          路線一覧を見る →
        </Link>
      </div>
    </main>
  );
}

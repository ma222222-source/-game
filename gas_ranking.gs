/**
 * CYBER RUNNER 全員共有ランキング — Google Apps Script
 * ───────────────────────────────────────────────────────────
 * 【これは何?】
 *   複数の端末(筐体)から送られたスコアを1つのGoogleスプレッドシートにためて
 *   トップ10を返すAPI。これをデプロイして得た「ウェブアプリURL」を
 *   index.html の GAS_URL に貼れば、全員共有ランキングが有効になる。
 *
 * 【スプレッドシートの構成(今回の変更点)】
 *   ・"ranking" シート  : 送信された生データを1件ずつ追記していく記録シート(そのまま)
 *   ・"leaderboard" シート: スプレッドシートの関数(LARGE)で"ranking"シートから
 *                          自動的にトップ10だけを常に計算し続ける集計シート(新規)。
 *     LARGE(範囲, k) は「範囲の中でk番目に大きい値」を返す関数で、
 *     MAX(範囲) はこの LARGE(範囲, 1) と同じ意味になる。
 *     1〜10位まで LARGE(...,1)〜LARGE(...,10) を並べることで、
 *     "MAXの考え方を使って常にトップ10が自動で出る表" を実現している。
 *     このシートを開けば、スクリプトを実行しなくても現在のトップ10がいつでも見られる。
 *   ・APIが返すランキングは、常にこの "leaderboard" シートの中身を読んで返す。
 *
 * 【管理者用: ランキングリセット】
 *   index.html側の「🌐 みんなランキングをリセット(管理者)」ボタンから、
 *   合言葉(初期値: 0623)を入力すると、"ranking" シートの生データを全消去できる。
 *   合言葉は下の ADMIN_PASSWORD 定数を書き換えれば変更できる。
 *
 * 【セットアップ手順】
 *   1. Googleスプレッドシートを新規作成する。
 *   2. 上部メニュー「拡張機能」→「Apps Script」を開く。
 *   3. 出てきたエディタの中身を全部消して、このファイルの内容を全部貼り付ける。
 *   4. 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」を選ぶ。
 *      - 「次のユーザーとして実行」: 自分
 *      - 「アクセスできるユーザー」: 全員
 *   5. デプロイ後に表示される「ウェブアプリ URL」(https://script.google.com/macros/s/.../exec)をコピー。
 *   6. index.html の先頭付近にある GAS_URL にそのURLを貼る。
 *   7. コードを更新した場合は「デプロイを管理」→鉛筆アイコン→「新しいバージョン」で
 *      必ず再デプロイすること(貼り替えただけでは反映されない)。
 *
 * 【プライバシー注意】
 *   名前とスコアがスプレッドシートに保存される。個人情報(本名・連絡先)は
 *   入力させない運用にすること。
 */

const SHEET_NAME = 'ranking';           // 生データ(全履歴)
const BOARD_SHEET_NAME = 'leaderboard'; // LARGE関数による自動トップ10集計シート
const TOP_N = 10;                       // トップ10固定(表示件数を変えたい場合はここと下のLARGE数式range両方を直す)
const ADMIN_PASSWORD = '0623';          // 管理者リセット用の合言葉

// GET: ランキング取得(leaderboardシートの計算結果をそのまま返す)
function doGet(e) {
  const data = getRankingFromBoard();
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, ranking: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

// POST: スコア送信 {name,score,title,comp} または 管理者リセット {action:'reset',password}
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // 管理者リセット処理
    if (body.action === 'reset') {
      if (String(body.password) !== ADMIN_PASSWORD) {
        return jsonOut({ ok: false, error: 'パスワードが違います' });
      }
      resetRankingData();
      return jsonOut({ ok: true, reset: true, ranking: getRankingFromBoard() });
    }

    // 通常のスコア送信処理
    const name = String(body.name || 'GUEST').slice(0, 12);
    const score = Math.max(0, Math.floor(Number(body.score) || 0));
    const title = String(body.title || '').slice(0, 40);
    const comp = Math.max(0, Math.min(100, Math.floor(Number(body.comp) || 0)));

    const sheet = getSheet();
    sheet.appendRow([new Date(), name, score, title, comp]);
    ensureLeaderboardFormulas(); // 行が増えてもLARGE範囲がずれないよう毎回検査

    return jsonOut({ ok: true, ranking: getRankingFromBoard() });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['date', 'name', 'score', 'title', 'comp']);
  }
  return sheet;
}

// "leaderboard" シートを用意し、LARGE関数によるトップ10自動計算式を書き込む。
// 1位〜10位それぞれの行に、スコア列(C列)全体から LARGE(範囲, 順位) でスコアを取り、
// 同じ行の名前・称号・コンプ率は INDEX+MATCH で対応するデータを引っ張ってくる。
// これにより「新しいスコアが増えるたびに自動で再計算される、常に正しいトップ10表」になる。
function ensureLeaderboardFormulas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let board = ss.getSheetByName(BOARD_SHEET_NAME);
  if (!board) {
    board = ss.insertSheet(BOARD_SHEET_NAME);
  }
  board.getRange(1, 1, 1, 5).setValues([['rank', 'name', 'score', 'title', 'comp']]);

  const nameRange = `${SHEET_NAME}!$B$2:$B`;
  const scoreRangeFull = `${SHEET_NAME}!$C$2:$C`;
  const titleRange = `${SHEET_NAME}!$D$2:$D`;
  const compRange = `${SHEET_NAME}!$E$2:$E`;

  const rows = [];
  for (let k = 1; k <= TOP_N; k++) {
    // LARGE(範囲, k) = 範囲の中でk番目に大きい値。k=1のときはMAX(範囲)と全く同じ結果になる。
    const scoreFormula = `=IFERROR(LARGE(${scoreRangeFull},${k}),"")`;
    // 同じスコアの行が複数あっても崩れないよう、MATCHで最初に一致した行を拾う
    const nameFormula = `=IFERROR(INDEX(${nameRange},MATCH(C${k + 1},${scoreRangeFull},0)),"")`;
    const titleFormula = `=IFERROR(INDEX(${titleRange},MATCH(C${k + 1},${scoreRangeFull},0)),"")`;
    const compFormula = `=IFERROR(INDEX(${compRange},MATCH(C${k + 1},${scoreRangeFull},0)),"")`;
    rows.push([k, nameFormula, scoreFormula, titleFormula, compFormula]);
  }
  // B/D/E列は式内でC列(このシート自身のスコア列)を参照するため、
  // 先にC列(score)を全行分書いてから、B/D/E列をまとめて書く。
  for (let i = 0; i < rows.length; i++) {
    board.getRange(i + 2, 1).setValue(rows[i][0]);   // rank
    board.getRange(i + 2, 3).setFormula(rows[i][2]); // score (先に計算させる)
  }
  SpreadsheetApp.flush();
  for (let i = 0; i < rows.length; i++) {
    board.getRange(i + 2, 2).setFormula(rows[i][1]); // name
    board.getRange(i + 2, 4).setFormula(rows[i][3]); // title
    board.getRange(i + 2, 5).setFormula(rows[i][4]); // comp
  }
}

// leaderboardシートの計算結果を読み取ってAPI用の配列に変換する
function getRankingFromBoard() {
  ensureLeaderboardFormulas();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const board = ss.getSheetByName(BOARD_SHEET_NAME);
  const values = board.getRange(2, 1, TOP_N, 5).getValues();
  const result = [];
  values.forEach(function (r) {
    const score = r[2];
    if (score === '' || score === null || isNaN(score)) return; // 空欄(データ不足)は除外
    result.push({ name: r[1] || 'GUEST', score: Number(score), title: r[3] || 'なし', comp: Number(r[4]) || 0 });
  });
  return result;
}

// 管理者リセット: 生データ(ranking)を全消去し、leaderboardの数式は保持したまま再計算させる
function resetRankingData() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 5).clearContent();
  }
  ensureLeaderboardFormulas(); // データが無くなった状態でLARGEが空欄を返すよう再計算
}

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
function legacyDoGet(e) {
  const data = getRankingFromBoard();
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, ranking: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

// POST: スコア送信 {name,score,title,comp} または 管理者リセット {action:'reset',password}
function legacyDoPost(e) {
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

/* 黒工 ARCADE共有ランキング。旧rankingシートと旧APIを保持する。 */
const ARCADE_SCHEMA='kokko-arcade-v4';
const ARCADE_GAMES=['cyberrunner','generator','cannon','battle','math','merge'];
const ARCADE_LOG='arcade_scores';
const ARCADE_BOARD='ARCADE_RANKING';
function doGet(e){
 try{const p=e&&e.parameter||{};if(p.action==='health')return jsonOut({ok:true,schema:ARCADE_SCHEMA,games:ARCADE_GAMES});
  if(!p.game)return legacyDoGet(e);
  const game=arcadeGame(p.game);if(p.action==='modes')return jsonOut({ok:true,schema:ARCADE_SCHEMA,game:game,modes:arcadeModes(game)});
  const mode=arcadeMode(p.mode||'standard');return jsonOut({ok:true,schema:ARCADE_SCHEMA,game:game,mode:mode,ranking:arcadeRanking(game,mode),serverTime:new Date().toISOString()});
 }catch(err){return jsonOut({ok:false,schema:ARCADE_SCHEMA,error:String(err.message||err)});}
}
function doPost(e){
 try{const body=JSON.parse(e.postData.contents);if(!body.game)return legacyDoPost(e);
  const game=arcadeGame(body.game),mode=arcadeMode(body.mode),row=arcadeValidate(body,game,mode);
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{const sheet=arcadeLog(),last=sheet.getLastRow();const prior=last>1?sheet.getRange(2,9,last-1,1).createTextFinder(row[8]).matchEntireCell(true).findNext():null;
   if(prior){const old=sheet.getRange(prior.getRow(),1,1,10).getValues()[0];if(old[1]!==game||old[2]!==mode||String(old[3]).replace(/^'(?=[=+\-@])/,'')!==String(row[3]).replace(/^'(?=[=+\-@])/,'')||Number(old[4])!==row[4])throw Error('requestId conflict');}
   else sheet.appendRow(row);
   arcadeRefreshBoard();SpreadsheetApp.flush();
   return jsonOut({ok:true,schema:ARCADE_SCHEMA,game:game,mode:mode,requestId:row[8],duplicate:!!prior,ranking:arcadeRanking(game,mode),serverTime:new Date().toISOString()});
  }finally{lock.releaseLock();}
 }catch(err){return jsonOut({ok:false,schema:ARCADE_SCHEMA,error:String(err.message||err)});}
}
function arcadeGame(value){const game=String(value||'');if(ARCADE_GAMES.indexOf(game)<0)throw Error('Invalid game');return game;}
function arcadeMode(value){const mode=String(value||'');if(!/^[a-zA-Z0-9_-]{1,48}$/.test(mode))throw Error('Invalid mode');return mode;}
function arcadeText(value,length){const text=String(value||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,length);return /^[=+\-@]/.test(text)?"'"+text:text;}
function arcadeValidate(body,game,mode){
 const score=Number(body.score);if(!Number.isInteger(score)||score<0||score>10000000)throw Error('Invalid score');
 const comp=Number(body.comp||0),combo=Number(body.combo||0);if(!Number.isFinite(comp)||comp<0||comp>100||!Number.isInteger(combo)||combo<0||combo>10000)throw Error('Invalid stats');
 const id=String(body.requestId||'');if(!/^[a-zA-Z0-9_-]{12,96}$/.test(id))throw Error('Invalid requestId');
 return[new Date(),game,mode,arcadeText(body.name||'GUEST',12)||'GUEST',score,arcadeText(body.title||'挑戦者',40),Math.round(comp),combo,id,mode.indexOf('test_')===0];
}
function arcadeLog(){const ss=SpreadsheetApp.getActiveSpreadsheet();if(!ss)throw Error('Spreadsheet not connected');let sheet=ss.getSheetByName(ARCADE_LOG);if(!sheet){sheet=ss.insertSheet(ARCADE_LOG);sheet.appendRow(['date','game','mode','name','score','title','comp','combo','requestId','test']);sheet.setFrozenRows(1);}return sheet;}
function arcadeRows(){const sheet=arcadeLog(),last=sheet.getLastRow();const rows=last>1?sheet.getRange(2,1,last-1,10).getValues():[];const legacy=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ranking');if(legacy&&legacy.getLastRow()>1){legacy.getRange(2,1,legacy.getLastRow()-1,5).getValues().forEach(function(r){if(r[2]!==''&&Number.isFinite(Number(r[2])))rows.push([r[0],'cyberrunner','standard',r[1]||'GUEST',Number(r[2]),r[3]||'挑戦者',Number(r[4])||0,0,'legacy',false]);});}return rows;}
function arcadeTop(rows){const players=Object.create(null);rows.forEach(function(r){const name=String(r[3]||'GUEST'),score=Number(r[4]);if(!Number.isFinite(score)||score<0)return;const old=players[name];if(!old||score>Number(old[4])||(score===Number(old[4])&&Number(r[6])>Number(old[6])))players[name]=r;});return Object.keys(players).map(function(n){return players[n];}).sort(function(a,b){return Number(b[4])-Number(a[4])||Number(b[6])-Number(a[6])||new Date(a[0]).getTime()-new Date(b[0]).getTime();}).slice(0,10);}
function arcadeRanking(game,mode){return arcadeTop(arcadeRows().filter(function(r){return r[1]===game&&r[2]===mode;})).map(function(r){return{name:String(r[3]),score:Number(r[4]),title:String(r[5]||'挑戦者'),comp:Number(r[6])||0,combo:Number(r[7])||0};});}
function arcadeModes(game){const found=Object.create(null);arcadeRows().forEach(function(r){if(r[1]===game&&String(r[2]).indexOf('test_')!==0)found[r[2]]=true;});return Object.keys(found).sort();}
function arcadeRefreshBoard(){
 const ss=SpreadsheetApp.getActiveSpreadsheet();let board=ss.getSheetByName(ARCADE_BOARD);if(!board){board=ss.insertSheet(ARCADE_BOARD);board.setFrozenRows(1);}
 const groups=Object.create(null);arcadeRows().forEach(function(r){if(r[9]||String(r[2]).indexOf('test_')===0)return;const key=r[1]+'|'+r[2];if(!groups[key])groups[key]=[];groups[key].push(r);});
 const rows=[['game','mode','rank','name','score','title','precision_or_collection','combo','updated_at']];
 Object.keys(groups).sort().forEach(function(key){arcadeTop(groups[key]).forEach(function(r,i){rows.push([r[1],r[2],i+1,arcadeText(r[3],12),Number(r[4]),arcadeText(r[5],40),Number(r[6])||0,Number(r[7])||0,new Date()]);});});
 const previous=board.getLastRow();board.getRange(1,1,rows.length,9).setValues(rows);if(previous>rows.length)board.getRange(rows.length+1,1,previous-rows.length,9).clearContent();
}

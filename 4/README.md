# CYBER RUNNER — Pi4 + GPIOボタン セットアップ

## 0. 【重要】2ゲーム構成への変更点(ハブ画面の追加)
CYBER RUNNERに加えて「ALGO ARCADE」(アルゴリズム体験アーケード、4モジュール構成)を
同じ筐体で遊べるようにした。1つの巨大HTMLに統合すると変数名衝突で壊れるため、
**別ファイルのまま、選択ハブ画面(`index.html`)から切り替える構成**にしている。

### 配置構成(この形のままPiに置く)
```
/home/pi/cyberrunner-pi/
├── index.html          ← 起動時に最初に表示される選択画面
├── cyberrunner/
│   └── index.html           ← CYBER RUNNER本体(旧: game/index.html から移動)
└── algo-arcade/
    └── game.html            ← ALGO ARCADE本体(新規)
```
**注意**: 従来 `game/index.html` に置いていたCYBER RUNNER本体は、今後は
`cyberrunner/index.html` に置く(フォルダ名が変わっている)。kiosk起動ファイルも
このハブを開くよう変更済み(下記6章参照)。

各ゲームのタイトル画面には「← アーケード選択に戻る」リンクがあり、押すと
`index.html` に戻る(相対パス `../index.html` なので、上記の配置構成を
崩さないこと)。

### ALGO ARCADE側で見つけて直したバグ
MODULE 03(暗算モード)で、タイマーの進行バーと残り秒数が**回答するまで表示が
固まって見える**バグがあった。0.1秒ごとに更新しようとするコードが、実際には
存在しないid/class(`math-timer-fill` / `math-time-display`)を参照していて
何も起きていなかった。該当箇所にid/classを正しく付与して修正済み。

---

前提: Raspberry Pi OS (64-bit, Desktop版, Bookworm) / Chromiumプリインストール済み

## 1. 配線(キット構成: Button×4 + Slide Switch×1 + T-shape Extension Board + Breadboard)

キットにButtonは4個しかないため、**DUCKのみSlide Switchで代用する**。
DUCKはJS側が「押しっぱなし」判定(keydown保持→keyup解除)のため、
常時ON状態を維持できるSlide Switchの方がむしろ操作に合う(スライドしてしゃがみ姿勢を保持、戻すと解除)。
電気的にはどちらもGPIO⇔GND間の開閉に過ぎないため、`buttons.py`は無改修で両対応する。

1. 40 Pin GPIO CableでPi4の40ピンヘッダとT-shape Extension Boardを接続
2. T-shape ExtensionBoardをBreadboardに挿す
3. 下記の通りBreadboard上で結線(GNDは共通レールでまとめてよい)

| アクション | 部品 | BCM GPIO | 配線 |
|---|---|---|---|
| LEFT | Button | GPIO5 | 片側→GPIO5, 反対側→GND |
| RIGHT | Button | GPIO6 | 片側→GPIO6, 反対側→GND |
| JUMP | Button | GPIO13 | 片側→GPIO13, 反対側→GND |
| DUCK | **Slide Switch** | GPIO19 | 共通(COM)ピン→GPIO19, ON側端子→GND, OFF側端子は未接続 |
| SKILL | Button | GPIO26 | 片側→GPIO26, 反対側→GND |

抵抗は不要(コード側で`pull_up=True`指定済み、内部プルアップ使用)。
Buttonの4本足タイプは対角2本が内部で常時導通しているモデルがあるため、
配線前にテスターかスマホのGPIOテストで実際に開閉する2本足の組み合わせを確認すること。

写真と実機のピン配置が異なる場合は `buttons.py` 冒頭の `GPIO_MAP` の数値だけ書き換えれば良い(以降のコードは無改修)。

### 発展案(今回は未実装・気が向いたら)
キットにはJoystick(X/Y analog + SW)とADC0834(4chアナログ→デジタル変換)も入っている。
これを使うとスティック1本で LEFT/RIGHT(X軸)・JUMP/DUCK(Y軸)・SKILL(SW押込み) の
5アクション全てを1本のレバーで賄えるアーケードスティック風構成にできる。
ただしADC0834はSPIをビット・バンギングで実装する必要がありコード量が増えるため、
まずはボタン+スライドスイッチ構成で動作確認してからの移行を推奨する。

## 2. ゲーム本体の配置
上記0章の構成の通り、以下に置く:
```
/home/pi/cyberrunner-pi/index.html
/home/pi/cyberrunner-pi/cyberrunner/index.html
/home/pi/cyberrunner-pi/algo-arcade/game.html
```

## 3. 依存パッケージ導入
```bash
sudo apt update
sudo apt install -y python3-pip python3-dev chromium-browser
sudo pip3 install gpiozero python-uinput --break-system-packages
```

## 4. uinput有効化
```bash
echo "uinput" | sudo tee /etc/modules-load.d/uinput.conf
sudo modprobe uinput
sudo cp 99-uinput.rules /etc/udev/rules.d/99-uinput.rules
sudo udevadm control --reload-rules && sudo udevadm trigger
sudo usermod -aG input pi
# ↑ usermod後は一度再起動 or ログアウトインが必要
```

## 5. ボタンデーモンをsystemdに登録
```bash
mkdir -p /home/pi/cyberrunner-pi
cp buttons.py /home/pi/cyberrunner-pi/
sudo cp cyberrunner-buttons.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cyberrunner-buttons.service
# 動作確認
sudo systemctl status cyberrunner-buttons.service
journalctl -u cyberrunner-buttons.service -f
```

## 6. Chromium kiosk自動起動
```bash
mkdir -p ~/.config/autostart
cp cyberrunner-kiosk.desktop ~/.config/autostart/
# デスクトップ自動ログインを有効化(まだなら):
sudo raspi-config  # → System Options → Boot / Auto Login → Desktop Autologin
```
このファイルは `index.html` を開くよう設定済み。起動すると
「CYBER RUNNER」と「ALGO ARCADE」を選ぶ画面が最初に表示される。

## 7. 動作確認の順序
1. 配線後、再起動
2. `journalctl -u cyberrunner-buttons.service -f` を見ながら各ボタンを押す
   → GPIOエラーが出ないか確認(ピン番号ミスはここで判明する)
3. ボタン押下でキーボードの矢印/Spaceを押したのと同じ反応がChromium上で起きるか確認
4. デスクトップ自動起動を有効化して再起動 → ゲームがフルスクリーンで自動起動するか確認

## 既知の注意点
- DUCKボタンのみ「押している間キー保持」。他4つはタップ動作(押した瞬間に離す)。
- Pi4のGPU(VideoCore VI)でThree.js/WebGL描画が重い場合、`chrome://gpu` で
  ハードウェアアクセラレーションが有効か確認する。無効なら `/boot/firmware/config.txt` に
  `dtoverlay=vc4-kms-v3d` が入っているか確認(Bookwormではデフォルトで有効なはず)。
- 副作用: `usermod -aG input pi` はpiユーザーの権限を拡張するため、
  他のinput系サービスとの権限競合がないか要確認(通常は問題ない)。

## ALGO ARCADE 各モジュールと物理ボタンの相性
CYBER RUNNERの物理GPIOボタンは矢印キー(LEFT/RIGHT/JUMP/DUCK)とSPACEしか送出しない。
ALGO ARCADEの4モジュールのうち、この入力だけで遊べるのは以下の通り:
- **MODULE 01(SPEED SORT CANNON)**: ◀▶+SPACE対応。物理ボタンだけで遊べる。
- **MODULE 04(ALGORITHM MERGE TOWER)**: ◀▶対応。物理ボタンだけで遊べる。
- **MODULE 02(SORT CARD BATTLE)**: カード選択はキーボードの数字キー(1〜9)かタッチ/クリック操作が前提。物理ボタンだけでは選択できないため、**タッチスクリーンでの操作が必須**。
- **MODULE 03(MENTAL MATH)**: 画面上のテンキーをタッチ/クリックする前提。同じくタッチスクリーンが必須。

筐体にタッチスクリーンが付いていれば全モジュール問題なく遊べる。もし物理ボタンのみで
MODULE 02/03も遊べるようにしたい場合は、別途カーソル移動方式への改修が必要になるので
その際は教えてほしい。

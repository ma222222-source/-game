# CYBER RUNNER — Joystick(ADC0834)セットアップ【訂正版】

このキット(SunFounder DaVinci Kit)の公式ライブラリ仕様に合わせて、前回渡した内容を全面的に訂正した。
前回の「CS/CLK/DI/DOを4本の別々のGPIOに繋ぐ」構成は誤り。正しくは**CS/CLK/DIOの3本のみ**
(DIとDOをIC側で直結し、1本のGPIOで入出力を切り替えて共用する)。

## 1. ICの物理ピンの数え方(14本足、切り欠きが目印)

切り欠き(半月形のへこみ)に一番近い足から、片側ずつ7本を数える。

**A面(切り欠きに近い方から1→7)**

| 順番 | 信号 |
|---|---|
| 1 | V+ |
| 2 | CS |
| 3 | CH0 |
| 4 | CH1 |
| 5 | CH2 |
| 6 | CH3 |
| 7 | DGND |

**B面(A面7番の真隣から、切り欠きに向かって1→7)**

| 順番 | 信号 |
|---|---|
| 1(A面7番の隣) | AGND |
| 2 | VREF |
| 3 | DO |
| 4 | SARS(未使用) |
| 5 | CLK |
| 6 | DI |
| 7(切り欠き直近) | VCC |

## 2. 配線

| 接続 | 内容 |
|---|---|
| V+ / VCC / VREF(3本) | まとめて3V3へ |
| DGND / AGND(2本) | まとめて既存の(−)レールへ |
| CS | GPIO17 |
| CLK | GPIO18 |
| DI と DO | **この2本をジャンパー線で直結**し、その合流点から1本だけGPIO27へ |
| SARS | 未使用・何も繋がない |
| CH0 | Joystick VRx |
| CH1 | Joystick VRy |
| CH2 / CH3 | 未使用 |

| Joystickのピン | 接続先 |
|---|---|
| VCC | 3V3 |
| GND | (−)レール |
| VRx | ADC0834のCH0 |
| VRy | ADC0834のCH1 |
| SW | **GPIO22** |

**配線前チェック**: 電源を切った状態で作業。ジャンパー線は必ず1対1。

## 3. 依存パッケージ

```bash
sudo apt install -y python3-rpi.gpio
```

## 4. 診断スクリプトで確認(必須)

```bash
sudo python3 ~/Downloads/test_joystick.py
```

スティックを中央→上下左右にゆっくり倒し、`X=`, `Y=`の値がなめらかに変化するか、
SWを押すと`PRESSED`になるかを確認する。

- 中央あたりで安定した値(120〜135程度)が出る → 正常
- 動かしても数値が変わらない → 前回同様、GND/VCC/CS/CLK/DIOのどれかの配線漏れ
- 値が飛び飛びで不安定 → DI/DOの直結(ジャンパー線)が緩んでいる可能性

## 5. 本番デーモンの登録

診断で正常に値が取れたら:

```bash
cp ~/Downloads/joystick.py /home/pi/cyberrunner-pi/
sudo cp ~/Downloads/cyberrunner-joystick.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cyberrunner-joystick.service
journalctl -u cyberrunner-joystick.service -f
```

起動直後に「中央値: X=... Y=...」のログが出る。**起動直後の数百ミリ秒はスティックに触れないこと**
(キャリブレーションが狂う)。ズレたら`sudo systemctl restart cyberrunner-joystick.service`で再calibrate。

## 6. 動作割り当て

- X軸(左右) → LEFT/RIGHT(タップ動作)
- Y軸上 → JUMP(タップ)
- Y軸下 → DUCK(倒している間キー保持)
- SW(押し込み) → プレイ中はSKILL、メニュー画面では「決定」ボタンとして動作

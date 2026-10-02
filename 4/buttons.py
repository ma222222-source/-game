#!/usr/bin/env python3
"""
CYBER RUNNER 用 GPIOボタン → 仮想キーボード変換デーモン
────────────────────────────────────────────────
役割: 5個のタクトスイッチをArrowLeft/Right/Up/Down/Spaceに変換して
      Chromium(ゲーム)にOSレベルのキーイベントとして送る。
      ゲーム側HTML/JSの改修は不要。

前提: /dev/uinput にアクセス可能なこと(udevルール+inputグループ参加が必要)
      → README.md参照

ピン配置(BCM番号、要写真確認・変更はGPIO_MAPのみでOK):
  LEFT=5, RIGHT=6, JUMP=13, DUCK=19, SKILL=26
  LEFT/RIGHT/JUMP/SKILLはButton(タクトスイッチ)、DUCKのみSlide Switch。
  電気的にはどちらもGPIO-GND間の開閉なので、コード側の扱いは完全に同一。
  全部品の反対側(またはON側端子)はGNDへ(内部プルアップ使用、抵抗不要)
"""
import uinput
from gpiozero import Button
from signal import pause

# ── ピン割当(写真確認後、ここだけ変更すればOK) ──
GPIO_MAP = {
    "LEFT":  5,
    "RIGHT": 6,
    "JUMP":  13,
    "DUCK":  19,
    "SKILL": 26,
}
BOUNCE_TIME = 0.03  # 30ms チャタリング除去。誤爆する場合は0.05に

KEY_MAP = {
    "LEFT":  uinput.KEY_LEFT,
    "RIGHT": uinput.KEY_RIGHT,
    "JUMP":  uinput.KEY_UP,
    "DUCK":  uinput.KEY_DOWN,
    "SKILL": uinput.KEY_SPACE,
}

device = uinput.Device(list(KEY_MAP.values()))
buttons = {}

def make_tap_handler(key):
    # 押した瞬間にpress+releaseを即時発火(ワンショット動作: LEFT/RIGHT/JUMP/SKILL用)
    def handler():
        device.emit_click(key)
    return handler

def make_hold_press(key):
    def handler():
        device.emit(key, 1)  # keydown
    return handler

def make_hold_release(key):
    def handler():
        device.emit(key, 0)  # keyup
    return handler

for name, pin in GPIO_MAP.items():
    try:
        btn = Button(pin, bounce_time=BOUNCE_TIME, pull_up=True)
    except Exception as e:
        # GPIO競合・存在しないピン番号などはここで検知して起動時に気づけるようにする
        raise RuntimeError(f"GPIO{pin}({name})の初期化に失敗: {e}") from e
    buttons[name] = btn

    if name == "DUCK":
        # DUCKだけは押している間キーを保持する(JS側がkeydown/keyupの両方で
        # startDuck()/stopDuck()を呼ぶ実装のため、タップ動作では成立しない)
        btn.when_pressed = make_hold_press(KEY_MAP[name])
        btn.when_released = make_hold_release(KEY_MAP[name])
    else:
        btn.when_pressed = make_tap_handler(KEY_MAP[name])

print("[cyberrunner-buttons] 起動完了。Ctrl+Cで終了。")
pause()

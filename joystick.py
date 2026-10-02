#!/usr/bin/env python3
"""
CYBER RUNNER 用 Joystick(ADC0834経由・正式仕様版) → 仮想キーボード変換デーモン
────────────────────────────────────────────────────────────
buttons.py(タクトスイッチ4個)とは独立して動作する。

X軸  → LEFT / RIGHT (タップ動作)
Y軸  → JUMP(上に倒す・タップ) / DUCK(下に倒す・倒している間キー保持)
SW   → SKILL(タップ) / メニューでは決定ボタン

配線: README_joystick.md 参照(CS=GPIO17, CLK=GPIO18, DIO=GPIO27, SW=GPIO22)
"""
import time
import uinput
import RPi.GPIO as GPIO

ADC_CS, ADC_CLK, ADC_DIO = 17, 18, 27
SW_PIN = 22

DEADZONE = 25        # 中央からこの範囲内は「入力なし」とみなす
RELEASE_MARGIN = 10  # チャタリング防止のヒステリシス幅
POLL_INTERVAL = 0.02  # 約50Hzでポーリング

GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(ADC_CS, GPIO.OUT)
GPIO.setup(ADC_CLK, GPIO.OUT)
GPIO.setup(SW_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)

events = (uinput.KEY_LEFT, uinput.KEY_RIGHT, uinput.KEY_UP, uinput.KEY_DOWN, uinput.KEY_SPACE)
device = uinput.Device(events)


def get_adc_result(channel: int) -> int:
    sel = int(channel > 1 & 1)
    odd = channel & 1

    GPIO.setup(ADC_DIO, GPIO.OUT)
    GPIO.output(ADC_CS, 0)

    GPIO.output(ADC_CLK, 0)
    GPIO.output(ADC_DIO, 1); time.sleep(0.000002)
    GPIO.output(ADC_CLK, 1); time.sleep(0.000002)
    GPIO.output(ADC_CLK, 0)
    GPIO.output(ADC_DIO, 1); time.sleep(0.000002)
    GPIO.output(ADC_CLK, 1); time.sleep(0.000002)
    GPIO.output(ADC_CLK, 0)
    GPIO.output(ADC_DIO, odd); time.sleep(0.000002)
    GPIO.output(ADC_CLK, 1); time.sleep(0.000002)
    GPIO.output(ADC_CLK, 0)
    GPIO.output(ADC_DIO, sel); time.sleep(0.000002)
    GPIO.output(ADC_CLK, 1); time.sleep(0.000002)
    GPIO.output(ADC_CLK, 0); time.sleep(0.000002)

    dat1 = 0
    for _ in range(8):
        GPIO.output(ADC_CLK, 1); time.sleep(0.000002)
        GPIO.output(ADC_CLK, 0); time.sleep(0.000002)
        GPIO.setup(ADC_DIO, GPIO.IN)
        dat1 = dat1 << 1 | GPIO.input(ADC_DIO)

    dat2 = 0
    for i in range(8):
        dat2 = dat2 | (GPIO.input(ADC_DIO) << i)
        GPIO.output(ADC_CLK, 1); time.sleep(0.000002)
        GPIO.output(ADC_CLK, 0); time.sleep(0.000002)

    GPIO.output(ADC_CS, 1)
    GPIO.setup(ADC_DIO, GPIO.OUT)
    return dat1 if dat1 == dat2 else 0


def calibrate_center(samples: int = 20) -> tuple[int, int]:
    """起動時に中央値を実測する(個体差・配線誤差を吸収するため)。"""
    xs, ys = [], []
    for _ in range(samples):
        xs.append(get_adc_result(0))
        ys.append(get_adc_result(1))
        time.sleep(0.01)
    return sum(xs) // len(xs), sum(ys) // len(ys)


def main():
    print("[joystick] 中央値をキャリブレーション中... スティックに触れないでください")
    cx, cy = calibrate_center()
    print(f"[joystick] 中央値: X={cx} Y={cy}  起動完了。Ctrl+Cで終了。")

    state = {"LEFT": False, "RIGHT": False, "JUMP": False, "DUCK": False, "SW": False}

    try:
        while True:
            x = get_adc_result(0) - cx
            y = get_adc_result(1) - cy

            if not state["LEFT"] and x < -DEADZONE:
                state["LEFT"] = True
                device.emit_click(uinput.KEY_LEFT)
            elif state["LEFT"] and x > -DEADZONE + RELEASE_MARGIN:
                state["LEFT"] = False

            if not state["RIGHT"] and x > DEADZONE:
                state["RIGHT"] = True
                device.emit_click(uinput.KEY_RIGHT)
            elif state["RIGHT"] and x < DEADZONE - RELEASE_MARGIN:
                state["RIGHT"] = False

            if not state["JUMP"] and y > DEADZONE:
                state["JUMP"] = True
                device.emit_click(uinput.KEY_UP)
            elif state["JUMP"] and y < DEADZONE - RELEASE_MARGIN:
                state["JUMP"] = False

            if not state["DUCK"] and y < -DEADZONE:
                state["DUCK"] = True
                device.emit(uinput.KEY_DOWN, 1)
            elif state["DUCK"] and y > -DEADZONE + RELEASE_MARGIN:
                state["DUCK"] = False
                device.emit(uinput.KEY_DOWN, 0)

            pressed = GPIO.input(SW_PIN) == 0
            if pressed and not state["SW"]:
                state["SW"] = True
                device.emit_click(uinput.KEY_SPACE)
            elif not pressed:
                state["SW"] = False

            time.sleep(POLL_INTERVAL)
    except KeyboardInterrupt:
        pass
    finally:
        if state["DUCK"]:
            device.emit(uinput.KEY_DOWN, 0)
        GPIO.cleanup()


if __name__ == "__main__":
    main()

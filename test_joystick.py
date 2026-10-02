#!/usr/bin/env python3
"""
ADC0834 + Joystick 動作確認用スクリプト(診断専用)
──────────────────────────────────────────────
このキット(SunFounder DaVinci Kit)の公式ライブラリ仕様に準拠。
DI/DOは1本のGPIO(DIO)を出力/入力に切り替えて共用する方式。

配線:
  CS=GPIO17, CLK=GPIO18, DIO=GPIO27(IC側でDI/DOピンを直結し、そこから1本)
  Joystick VRx→CH0, VRy→CH1, SW→GPIO22
"""
import RPi.GPIO as GPIO
import time

ADC_CS, ADC_CLK, ADC_DIO = 17, 18, 27
SW_PIN = 22

GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(ADC_CS, GPIO.OUT)
GPIO.setup(ADC_CLK, GPIO.OUT)
GPIO.setup(SW_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)


def get_adc_result(channel: int) -> int:
    """ADC0834の指定チャンネル(0〜3)をシングルエンドモードで読む。戻り値は0〜255。"""
    sel = int(channel > 1 & 1)
    odd = channel & 1

    GPIO.setup(ADC_DIO, GPIO.OUT)
    GPIO.output(ADC_CS, 0)

    # Start bit
    GPIO.output(ADC_CLK, 0)
    GPIO.output(ADC_DIO, 1); time.sleep(0.000002)
    GPIO.output(ADC_CLK, 1); time.sleep(0.000002)
    # Single End mode
    GPIO.output(ADC_CLK, 0)
    GPIO.output(ADC_DIO, 1); time.sleep(0.000002)
    GPIO.output(ADC_CLK, 1); time.sleep(0.000002)
    # ODD
    GPIO.output(ADC_CLK, 0)
    GPIO.output(ADC_DIO, odd); time.sleep(0.000002)
    GPIO.output(ADC_CLK, 1); time.sleep(0.000002)
    # Select
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


try:
    print("Ctrl+Cで終了。スティックを動かして値の変化を確認してください。")
    while True:
        x = get_adc_result(0)
        y = get_adc_result(1)
        sw = "PRESSED" if GPIO.input(SW_PIN) == 0 else "released"
        print(f"X={x:3d}  Y={y:3d}  SW={sw}      ", end="\r")
        time.sleep(0.1)
except KeyboardInterrupt:
    pass
finally:
    GPIO.cleanup()
    print("\n終了しました。")

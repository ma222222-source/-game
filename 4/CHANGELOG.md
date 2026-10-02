# ARCADE SYSTEM — 統合版 (v2.0)

## 構成
- index.html … ハブ(SYSTEM SELECT)
- cyberrunner/index.html … CYBER RUNNER
- algo-arcade/game.html … ALGO ARCADE
- gas_ranking.gs … 共有ランキング(LARGE関数で常時トップ10 / 管理者リセット 合言葉0623)
- buttons.py / joystick.py / *.service / 99-uinput.rules / cyberrunner-kiosk.desktop … Pi周辺

## v2.0 で入った主な変更
### バグ修正
- ALGO: 結果画面の「もう一度」「難易度を変える」が無反応(非公開関数名をonclickで呼んでいた/6ボタン)
- ALGO: MODULE03/04の戻るボタンが画面遷移のたびに消える(innerHTML上書き)
- CYBER: 斜めスワイプでジャンプが発火しない(瞬間速度ベース判定に変更)
- CYBER: 無操作タイムアウトの二重化、gstate不整合、非表示画面の戻るボタン重なり
### 操作
- 二本指タップ/長押し離しでスキル、ダブルタップ猶予緩和、斜めジャンプボーナス、ジェスチャー認識フラッシュ
- 戻るボタンは全て左上固定
### 演出・UI
- ALGO: カード交換の3Dすれ違い、選択浮遊、光沢、クリア整列ウェーブ、星の順次バウンス、メニューのチルト/粒子
- CYBER: クリック音・リップル・モーダル/トースト・起動画面・ロゴ定期グリッチ・ハイパー突入FOVパンチ・ハイパー残り秒数
### 最適化
- CYBER: 適応解像度(FPS低下で描画解像度を0.6〜1.0で自動調整)、タブ非表示で自動ポーズ
### ランキング
- GAS: leaderboardシートがLARGE関数で自動トップ10、管理者リセット(要再デプロイ)

## Pi配置メモ
/home/pi/cyberrunner-pi/ に index.html, cyberrunner/, algo-arcade/ を置く。

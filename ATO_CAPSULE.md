# Ato Ready-State overlay

- Upstream commit: `56c577941a41cd8826bd73d3120dbc524c1d9d3e`
- Primary screen: 「実食」。寿司皿として表現されたタスクを選び、ポモドーロタイマーを操作する画面。
- Why meaningful: 寿司GoTo固有の「仕込み → 実食 → 精算」の中心で、タスク選択と集中タイマーを直ちに操作できるため。
- Seed: 3件の Ato デモタスク。`?ato-demo=1` ではブラウザ保存値に依存せず毎回同じ状態を生成する。
- External services: Google Fonts と Tailwind CDN を除去。実行時ネットワーク取得なし。
- Interaction: タイマーが進むこと、一時停止中は停止すること、再開後に再び進むことを確認する。

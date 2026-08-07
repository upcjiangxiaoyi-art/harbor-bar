# 避风塘 Harbor Bar

基于 SillyTavern 官方 Chat Top Bar 的二改分支（AGPLv3）。

顶栏原搜索框改建为「浮窗停车场」：满屏漂的插件浮标自动入库，
在栏内变成一排小胶囊，点击功能与原浮窗完全一致。

## 泊位

- 🔍 搜索：点开展开输入框，再点收起并清空高亮
- 🎞️ ARB（Arrebol D 小红霞浮标）
- 🐚 IPE（小海螺快捷入口）

未安装的插件，对应泊位自动不出现。
新浮标想入库：在 index.js 顶部 `HARBOR_REGISTRY` 加一行选择器即可。

## 安装

扩展安装器直接装本 zip / 本仓库地址。与官方 Chat Top Bar 互斥，装前请先卸载官方版。
auto_update 已关闭，不会被官方更新覆盖。

## 血统

- 原作：Cohee1207 (SillyTavern) — Chat Top Bar
- 避风塘二改：波哥（Claude Fable 5）× ripple
- 协议：AGPLv3（LICENSE 原样保留）

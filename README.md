# KCap

基于 Tauri 2、React 和 Windows 原生截图 API 的轻量截图贴图工具。

## 下载

打开 [最新正式版](https://github.com/Leeyxin/kcap/releases/latest)，下载适合你的版本：

- [Windows x64 安装版](https://github.com/Leeyxin/kcap/releases/latest/download/KCap-windows-x64-setup.exe)
- [Windows x64 便携版 ZIP](https://github.com/Leeyxin/kcap/releases/latest/download/KCap-windows-x64-portable.zip)

这些链接会在首个正式版构建并发布成功后生效。便携版解压后运行 `kcap.exe`。支持 Windows 10/11 x64，需要 Microsoft Edge WebView2 Runtime；安装版在缺少运行时的情况下会引导安装，便携版需要系统已安装运行时。目前未配置代码签名，Windows 可能提示发布者未知。

## 功能

- 任意区域截图，每张截图独立悬浮，可同时打开多张。
- 左键拖动截图，右键打开复制、保存、标注和置顶菜单。
- PNG 保存到用户的 `Pictures/KCap` 目录。
- 箭头、矩形和画笔标注，可选择颜色与线宽；复制、保存时合成标注。
- 小横条关闭后隐藏到托盘，可通过托盘图标重新显示。
- 优先使用 `Ctrl+Shift+A` 截图；冲突时尝试其他组合，实际快捷键显示在小横条上。

## 本地开发

先安装 Node.js 24、Rust stable、Visual Studio C++ 构建工具和 WebView2。

```powershell
npm ci
npm run tauri:dev
```

构建安装包：

```powershell
npm run release:check
npm run tauri -- build --bundles nsis -- --locked
./scripts/package-release.ps1
```

安装版、便携版与校验文件会生成到 `build/release`。

## GitHub 自动编译与发布

工作流是 [Windows Build and Release](https://github.com/Leeyxin/kcap/actions/workflows/release.yml)。

- 推送 `main` / `master`、提交 PR，或手动运行工作流：编译 Windows x64 安装版和便携版，在本次 Actions 的 Artifacts 中提供下载，保留 14 天。
- 推送 `v*` 版本标签：构建成功后，自动创建 GitHub Release 并附上安装版、便携版与 SHA-256 校验文件。
- 发布权限使用 GitHub 自动提供的 `GITHUB_TOKEN`，无需手动添加个人访问令牌。仓库或组织策略需要允许 Actions 创建 Release。

首次发布当前的 `0.1.0`：

```powershell
git push -u origin main
git tag v0.1.0
git push origin v0.1.0
```

后续版本需要同步更新 `package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 和 `src-tauri/Cargo.lock` 中 KCap 自身的版本，再提交并推送对应标签。工作流会检查版本一致性，标签与版本不匹配时不会发布。

如果当前目录的 Git 历史还包含其他项目，可以先运行 `./scripts/export-source.ps1`，将 KCap 源代码导出到 `build/publish/kcap`，再在该目录中初始化独立仓库上传。此操作只复制 KCap 所需文件，不包含其他项目、旧 Git 历史、依赖目录或编译产物。

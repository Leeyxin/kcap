# 开发与发布

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

发布当前的 `0.1.2`：

```powershell
git push -u origin main
git tag v0.1.2
git push origin v0.1.2
```

后续版本需要同步更新 `package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 和 `src-tauri/Cargo.lock` 中 KCap 自身的版本，再提交并推送对应标签。工作流会检查版本一致性，标签与版本不匹配时不会发布。

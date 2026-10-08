# OrangeSea Android APK 打包

> 形态：**Capacitor WebView 壳 × Web 版服务**。APK 本身只带一个本地启动页；
> 首启输入你部署好的 Web 服务地址（`npm run web` 或 Docker，见 `docs/DEPLOY_WEB.md`），
> 之后所有页面与 `/api` 都在服务端同源加载——不跨域、不打包业务代码，服务端升级 APK 免更新。

## 一、准备（一次性）

- Android Studio（SDK Platform 34+、Build-Tools、Platform-Tools）
- JDK 17+（Android Studio 自带亦可）
- Node 20+
- 一台部署好的 Web 服务（手机可达：同局域网 `http://电脑IP:3000`，或 NAS/公网 HTTPS）

## 二、生成与打包

```bash
# 1) 生成壳的启动页与 Capacitor 配置（两种模式二选一）
npm run android:sync                        # 首启由用户在手机上输入服务地址（默认预填本机局域网 IP）
npm run android:sync -- --url http://192.168.1.8:3000   # 或把地址烧进 APK（免输入）

# 2) 装 Capacitor（devDependencies，不影响桌面版）
npm i -D @capacitor/cli @capacitor/core @capacitor/android

# 3) 首次生成原生工程，之后每次改壳重新 sync
npx cap add android          # 仅首次
npx cap sync android

# 4) 出 APK
cd android
gradlew.bat assembleDebug    # Windows；macOS/Linux 用 ./gradlew
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
gradlew.bat assembleRelease  # 正式包（需配置签名，见下）
```

## 三、必要的小改动（`npx cap add android` 之后）

1. **HTTP 明文许可**（服务是局域网 `http://` 时必须）：`android/app/src/main/AndroidManifest.xml`
   的 `<application>` 加 `android:usesCleartextTraffic="true"`（HTTPS 服务可跳过）。
2. **横竖屏**：默认跟随系统即可；要锁定竖屏在 `<activity>` 加
   `android:screenOrientation="portrait"`。
3. **应用名/图标**：`android/app/src/main/res/`（图标可用 Android Studio 的 Image Asset 生成）。

## 四、签名发布（assembleRelease）

`android/key.properties`（勿入库）：

```properties
storeFile=orangesea.jks
storePassword=***
keyAlias=orangesea
keyPassword=***
```

`android/app/build.gradle` 引入（Capacitor 模板注释里有现成段落），然后 `gradlew.bat assembleRelease`。
调试包直接安装即可体验：`adb install -r app-debug.apk`。

## 五、已知边界（与 Web 版一致）

- 在线音源/歌词/全部视觉模式与主题可用；本地库导入、Automix ONNX、桌面歌词等桌面专属能力不可用（自动降级）。
- WebView 后台播放：熄屏后音频会被系统暂停；常驻后台需要前台服务 + MediaSession（原生扩展，按需后续加）。
- 竖屏下沉浸式视觉模式可用但构图按桌面宽屏调校，横屏体验最佳。

## 六、脚本与文件清单

| 文件 | 作用 |
| --- | --- |
| `scripts/android-sync.js` | 生成 `android-www/index.html`（启动页）与 `capacitor.config.json`（`--url` 可选烧录地址） |
| `android-www/` | 壳的 webDir（提交了默认版本，可随时重新生成覆盖） |
| `capacitor.config.json` | appId `com.orangesea.app` / webDir / 可选 `server.url` |
| `android/` | `npx cap add android` 生成的原生工程（不入库，`cap sync` 可再生） |

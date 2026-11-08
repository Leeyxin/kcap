# KCap

[简体中文](README.md) | **English**

Capture a region of your screen and keep it floating on your desktop.

KCap is a Windows screenshot tool that lets you keep multiple screenshots on screen at once. Move them around while comparing documents, checking reference images, or keeping information close at hand. When you need to share a screenshot, annotate it, copy it, or save it as an image.

## Download and Install

Supports **Windows 10 / 11, 64-bit (x64)**.

| Version | Download | Getting started |
| --- | --- | --- |
| Installer | [Download the installer](https://github.com/Leeyxin/kcap/releases/latest/download/KCap-windows-x64-setup.exe) | Run the downloaded file and follow the installation prompts. |
| Portable | [Download the ZIP](https://github.com/Leeyxin/kcap/releases/latest/download/KCap-windows-x64-portable.zip) | Extract the ZIP and run `kcap.exe`. No installation needed. |

These links always point to the latest stable release. For older versions and release notes, visit [Releases](https://github.com/Leeyxin/kcap/releases).

KCap requires Microsoft Edge WebView2 Runtime. The installer will help install it if it is missing. For the portable version, make sure the runtime is already installed on your computer.

The app currently uses Chinese interface labels. This guide includes the labels you will see on screen.

## Take a Screenshot

1. Open KCap. A small toolbar appears on your desktop.
2. Click **Capture (截图)** or press the shortcut shown on the toolbar.
3. Hold the left mouse button and drag to select a region. Release to open it as a floating screenshot. Press `Esc` to cancel a capture.

Each capture opens a new window, keeping your earlier screenshots on screen. You can move and close each one independently.

KCap first tries to use `Ctrl+Shift+A`. If another program has already registered that shortcut, it tries alternatives. Use the shortcut actually shown on your toolbar. If no shortcut is shown, you can still capture from the toolbar or system tray menu.

## Work with Floating Screenshots

| What you want to do | How to do it |
| --- | --- |
| Move a screenshot | Hold the left mouse button on the screenshot and drag. |
| Open its menu | Right-click the screenshot. |
| Copy an image | Choose **Copy image (复制图片)**, then paste it into a chat or document. |
| Save an image | Choose **Save image (保存图片)** to save a PNG on your computer. |
| Change its always-on-top setting | Choose **Unpin (取消置顶)** or **Keep on top (保持置顶)**. |
| Close one screenshot | Choose **Close this image (关闭此图)**. |

Images are saved in `Pictures\KCap` under your user folder, for example `C:\Users\YourName\Pictures\KCap`. A message in the screenshot window shows the file path after saving.

**Screenshots are not saved automatically.** Floating windows are meant for temporary reference. Save any images you want to keep before closing their windows or quitting KCap.

## Annotate an Image

Right-click a screenshot and choose **Annotate (标注)**. You can draw arrows, rectangles, or freehand strokes, and choose a color and line width.

- Hold the left mouse button and drag to draw with the selected tool.
- Click **Clear (清空)** to remove all annotations from that screenshot.
- Click **Done (完成)** to leave annotation mode and return to dragging the window.

Copying or saving an image includes its annotations.

## Hide the Toolbar or Quit

Clicking `x` on the small toolbar only hides the toolbar. KCap keeps running, and your floating screenshots stay on screen.

To bring the toolbar back, left-click the KCap icon in the Windows notification area at the bottom right of your screen. If the icon is not visible, expand the hidden icons list. You can also right-click the tray icon and choose **Show toolbar (显示工具栏)** or start another capture from its menu.

To quit completely, choose **Quit (退出)** from the tray menu, or **Quit all (退出全部)** from a screenshot's right-click menu. Quitting closes all floating screenshots, so save any images you want to keep first.

## Common Questions

### Why does Windows show an unknown publisher warning?

The current release is not code-signed, so Windows may show this warning. Check that your download came from this repository's [official Releases page](https://github.com/Leeyxin/kcap/releases).

### Why can't I drag a screenshot?

In annotation mode, the left mouse button is used for drawing. Click **Done (完成)** on the annotation toolbar, then drag the screenshot.

### Why isn't the shortcut working?

Check the shortcut actually shown on the toolbar. KCap may use a different combination if the preferred one is already registered by another program. You can also click **Capture (截图)** or use the tray menu.

## Feedback

Found a problem or have a feature suggestion? [Open an issue](https://github.com/Leeyxin/kcap/issues). For bug reports, please include your KCap version, Windows version, steps to reproduce, and any error messages.

For development and packaging details, see the [developer documentation (Chinese)](docs/DEVELOPMENT.md).

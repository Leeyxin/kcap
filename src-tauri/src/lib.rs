use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[derive(Clone, Serialize)]
struct CaptureResult {
    image: String,
    width: i32,
    height: i32,
}

#[derive(Serialize)]
struct ScreenBounds {
    left: i32,
    top: i32,
    width: i32,
    height: i32,
}

#[derive(Default)]
struct CaptureStore {
    next_id: AtomicU64,
    captures: Mutex<HashMap<String, CaptureResult>>,
}

#[derive(Default)]
struct ShortcutHint {
    label: Mutex<Option<String>>,
}

#[derive(Serialize)]
struct CaptureWindowResult {
    id: String,
    width: i32,
    height: i32,
}

#[tauri::command]
fn capture_screen(window: tauri::Window) -> Result<CaptureResult, String> {
    let _ = window.hide();
    thread::sleep(Duration::from_millis(180));

    let result = platform::capture_screen();

    let _ = window.show();
    result
}

#[tauri::command]
fn capture_region(left: i32, top: i32, width: i32, height: i32) -> Result<CaptureResult, String> {
    platform::capture_region(left, top, width, height)
}

#[tauri::command]
fn screen_bounds() -> Result<ScreenBounds, String> {
    platform::screen_bounds()
}

#[tauri::command]
fn shortcut_hint(state: tauri::State<'_, ShortcutHint>) -> Result<Option<String>, String> {
    Ok(state
        .label
        .lock()
        .map_err(|_| "Unable to access the shortcut state.".to_string())?
        .clone())
}

#[tauri::command]
async fn capture_region_window(
    app: tauri::AppHandle,
    store: tauri::State<'_, CaptureStore>,
    left: i32,
    top: i32,
    width: i32,
    height: i32,
) -> Result<CaptureWindowResult, String> {
    let capture = platform::capture_region(left, top, width, height)?;
    let id = format!("shot-{}", store.next_id.fetch_add(1, Ordering::Relaxed) + 1);
    let (window_width, window_height) = preview_window_size(capture.width, capture.height);
    let (window_left, window_top) = preview_window_position(left, top, window_width, window_height)?;

    store
        .captures
        .lock()
        .map_err(|_| "Unable to access the capture store.".to_string())?
        .insert(id.clone(), capture.clone());

    tauri::WebviewWindowBuilder::new(
        &app,
        &id,
        tauri::WebviewUrl::App(format!("index.html?shot={id}").into()),
    )
    .title(format!("KCap {id}"))
    .inner_size(window_width, window_height)
    .min_inner_size(140.0, 90.0)
    .position(window_left, window_top)
    .decorations(false)
    .transparent(false)
    .resizable(true)
    .always_on_top(true)
    .skip_taskbar(false)
    .shadow(true)
    .build()
    .map_err(|err| {
        let _ = store
            .captures
            .lock()
            .map(|mut captures| captures.remove(&id));
        format!("Unable to create the capture window: {err}")
    })?;

    Ok(CaptureWindowResult {
        id,
        width: capture.width,
        height: capture.height,
    })
}

#[tauri::command]
fn get_capture(
    store: tauri::State<'_, CaptureStore>,
    id: String,
) -> Result<Option<CaptureResult>, String> {
    Ok(store
        .captures
        .lock()
        .map_err(|_| "Unable to access the capture store.".to_string())?
        .get(&id)
        .cloned())
}

#[tauri::command]
fn forget_capture(store: tauri::State<'_, CaptureStore>, id: String) -> Result<(), String> {
    store
        .captures
        .lock()
        .map_err(|_| "Unable to access the capture store.".to_string())?
        .remove(&id);
    Ok(())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn save_image_data_url(image_data: String) -> Result<String, String> {
    let bytes = decode_image_data_url(&image_data)?;
    let path = default_capture_path()?;

    fs::write(&path, bytes).map_err(|err| format!("Unable to save the image: {err}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn copy_image_data_url(image_data: String) -> Result<(), String> {
    let bytes = decode_image_data_url(&image_data)?;
    platform::copy_png_to_clipboard(&bytes)
}

pub fn run() {
    tauri::Builder::default()
        .manage(CaptureStore::default())
        .manage(ShortcutHint::default())
        .setup(|app| {
            if let Err(err) = setup_tray(app) {
                eprintln!("KCap tray setup failed: {err}");
            }

            if let Err(err) = setup_global_shortcuts(app) {
                eprintln!("KCap global shortcut setup failed: {err}");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            capture_screen,
            capture_region,
            screen_bounds,
            shortcut_hint,
            capture_region_window,
            get_capture,
            forget_capture,
            exit_app,
            save_image_data_url,
            copy_image_data_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running KCap");
}

fn decode_image_data_url(image_data: &str) -> Result<Vec<u8>, String> {
    let encoded = image_data
        .split_once(',')
        .map(|(_, data)| data)
        .unwrap_or(image_data)
        .trim();

    general_purpose::STANDARD
        .decode(encoded)
        .map_err(|err| format!("Unable to decode the image: {err}"))
}

fn default_capture_path() -> Result<PathBuf, String> {
    let base = std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .unwrap_or(std::env::current_dir().map_err(|err| format!("Unable to locate a save folder: {err}"))?);
    let dir = base.join("Pictures").join("KCap");

    fs::create_dir_all(&dir).map_err(|err| format!("Unable to create the save folder: {err}"))?;

    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| format!("Unable to create a file name: {err}"))?
        .as_millis();

    Ok(dir.join(format!("KCap-{millis}.png")))
}

fn setup_global_shortcuts(app: &tauri::App) -> tauri::Result<()> {
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    let _ = app.emit("kcap://start-selection", ());
                }
            })
            .build(),
    )?;

    let candidates = [
        ("ctrl+shift+a", "Ctrl+Shift+A"),
        ("ctrl+alt+a", "Ctrl+Alt+A"),
        ("alt+shift+a", "Alt+Shift+A"),
    ];
    let mut selected = None;

    for (shortcut, label) in candidates {
        match app.global_shortcut().register(shortcut) {
            Ok(()) => {
                selected = Some(label.to_string());
                break;
            }
            Err(err) => {
                eprintln!("KCap global shortcut {label} unavailable: {err}");
            }
        }
    }

    if let Some(label) = &selected {
        eprintln!("KCap global shortcut registered: {label}");
    } else {
        eprintln!("KCap started without a global shortcut; use the toolbar or tray menu.");
    }

    if let Ok(mut hint) = app.state::<ShortcutHint>().label.lock() {
        *hint = selected;
    }

    Ok(())
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let start_capture = MenuItem::with_id(app, "start_capture", "截图", true, None::<&str>)?;
    let show_toolbar = MenuItem::with_id(app, "show_toolbar", "显示工具栏", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&start_capture, &show_toolbar, &quit])?;

    let mut tray = TrayIconBuilder::with_id("kcap")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("KCap 截图工具")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "start_capture" => emit_start_selection(app),
            "show_toolbar" => show_toolbar_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } = event
            {
                show_toolbar_window(tray.app_handle());
            }

            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_toolbar_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;
    Ok(())
}

fn emit_start_selection(app: &tauri::AppHandle) {
    show_toolbar_window(app);
    let _ = app.emit("kcap://start-selection", ());
}

fn show_toolbar_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("kcap://show-toolbar", ());
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn preview_window_size(width: i32, height: i32) -> (f64, f64) {
    let max_width = 520.0;
    let max_height = 360.0;
    let min_width = 180.0;
    let min_height = 120.0;
    let width = width.max(1) as f64;
    let height = height.max(1) as f64;
    let scale = (max_width / width).min(max_height / height).min(1.0);

    (
        (width * scale).clamp(min_width, max_width),
        (height * scale).clamp(min_height, max_height),
    )
}

fn preview_window_position(
    left: i32,
    top: i32,
    window_width: f64,
    window_height: f64,
) -> Result<(f64, f64), String> {
    let bounds = platform::screen_bounds()?;
    let max_left = bounds.left + bounds.width - window_width as i32;
    let max_top = bounds.top + bounds.height - window_height as i32;
    let x = (left + 24).clamp(bounds.left, max_left.max(bounds.left));
    let y = (top + 24).clamp(bounds.top, max_top.max(bounds.top));

    Ok((x as f64, y as f64))
}

#[cfg(windows)]
mod platform {
    use std::{io::Cursor, mem::size_of, ptr::copy_nonoverlapping};

    use base64::{engine::general_purpose, Engine as _};
    use image::{DynamicImage, ImageBuffer, ImageFormat, Rgba};
    use windows::Win32::{
        Foundation::{GlobalFree, HANDLE},
        Graphics::Gdi::{
            BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
            GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT,
            DIB_RGB_COLORS, HBITMAP, HDC, HGDIOBJ, SRCCOPY,
        },
        System::{
            DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData},
            Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE},
        },
        UI::WindowsAndMessaging::{
            GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
            SM_YVIRTUALSCREEN,
        },
    };

    use super::{CaptureResult, ScreenBounds};

    struct ScreenDc(HDC);

    impl Drop for ScreenDc {
        fn drop(&mut self) {
            unsafe {
                let _ = ReleaseDC(None, self.0);
            }
        }
    }

    struct MemoryDc(HDC);

    impl Drop for MemoryDc {
        fn drop(&mut self) {
            unsafe {
                let _ = DeleteDC(self.0);
            }
        }
    }

    struct Bitmap(HBITMAP);

    impl Drop for Bitmap {
        fn drop(&mut self) {
            unsafe {
                let _ = DeleteObject(HGDIOBJ(self.0 .0));
            }
        }
    }

    pub fn screen_bounds() -> Result<ScreenBounds, String> {
        let left = unsafe { GetSystemMetrics(SM_XVIRTUALSCREEN) };
        let top = unsafe { GetSystemMetrics(SM_YVIRTUALSCREEN) };
        let width = unsafe { GetSystemMetrics(SM_CXVIRTUALSCREEN) };
        let height = unsafe { GetSystemMetrics(SM_CYVIRTUALSCREEN) };

        if width <= 0 || height <= 0 {
            return Err("Unable to read the screen size.".into());
        }

        Ok(ScreenBounds {
            left,
            top,
            width,
            height,
        })
    }

    pub fn capture_screen() -> Result<CaptureResult, String> {
        let bounds = screen_bounds()?;
        capture_region(bounds.left, bounds.top, bounds.width, bounds.height)
    }

    pub fn capture_region(
        left: i32,
        top: i32,
        width: i32,
        height: i32,
    ) -> Result<CaptureResult, String> {
        if width <= 0 || height <= 0 {
            return Err("The capture area is too small.".into());
        }

        let screen_dc = ScreenDc(unsafe { GetDC(None) });
        if screen_dc.0.is_invalid() {
            return Err("Unable to access the desktop device context.".into());
        }

        let memory_dc = MemoryDc(unsafe { CreateCompatibleDC(Some(screen_dc.0)) });
        if memory_dc.0.is_invalid() {
            return Err("Unable to create the capture buffer.".into());
        }

        let bitmap = Bitmap(unsafe { CreateCompatibleBitmap(screen_dc.0, width, height) });
        if bitmap.0.is_invalid() {
            return Err("Unable to create the capture bitmap.".into());
        }

        let previous = unsafe { SelectObject(memory_dc.0, HGDIOBJ(bitmap.0 .0)) };
        if previous.is_invalid() {
            return Err("Unable to select the capture bitmap.".into());
        }

        let blit_ok = unsafe {
            BitBlt(
                memory_dc.0,
                0,
                0,
                width,
                height,
                Some(screen_dc.0),
                left,
                top,
                SRCCOPY | CAPTUREBLT,
            )
        };

        if blit_ok.is_err() {
            unsafe {
                let _ = SelectObject(memory_dc.0, previous);
            }
            return Err("Screen copy failed.".into());
        }

        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut bgra = vec![0u8; (width * height * 4) as usize];
        let scanlines = unsafe {
            GetDIBits(
                memory_dc.0,
                bitmap.0,
                0,
                height as u32,
                Some(bgra.as_mut_ptr().cast()),
                &mut info,
                DIB_RGB_COLORS,
            )
        };

        unsafe {
            let _ = SelectObject(memory_dc.0, previous);
        }

        if scanlines == 0 {
            return Err("Unable to read captured pixels.".into());
        }

        for pixel in bgra.chunks_exact_mut(4) {
            pixel.swap(0, 2);
            pixel[3] = 255;
        }

        let image = ImageBuffer::<Rgba<u8>, _>::from_raw(width as u32, height as u32, bgra)
            .ok_or_else(|| "The capture pixel format is invalid.".to_string())?;
        let dynamic = DynamicImage::ImageRgba8(image);
        let mut png = Cursor::new(Vec::new());
        dynamic
            .write_to(&mut png, ImageFormat::Png)
            .map_err(|err| format!("PNG encoding failed: {err}"))?;

        Ok(CaptureResult {
            image: format!(
                "data:image/png;base64,{}",
                general_purpose::STANDARD.encode(png.into_inner())
            ),
            width,
            height,
        })
    }

    pub fn copy_png_to_clipboard(png: &[u8]) -> Result<(), String> {
        let dib = png_to_clipboard_dib(png)?;

        unsafe {
            OpenClipboard(None).map_err(|err| format!("Unable to open the clipboard: {err}"))?;
        }
        let _clipboard = ClipboardGuard;

        unsafe {
            EmptyClipboard().map_err(|err| format!("Unable to clear the clipboard: {err}"))?;
        }

        let memory = unsafe {
            GlobalAlloc(GMEM_MOVEABLE, dib.len())
                .map_err(|err| format!("Unable to allocate clipboard memory: {err}"))?
        };

        let locked = unsafe { GlobalLock(memory) };
        if locked.is_null() {
            unsafe {
                let _ = GlobalFree(Some(memory));
            }
            return Err("Unable to lock clipboard memory.".into());
        }

        unsafe {
            copy_nonoverlapping(dib.as_ptr(), locked.cast::<u8>(), dib.len());
            let _ = GlobalUnlock(memory);
        }

        let result = unsafe { SetClipboardData(8, Some(HANDLE(memory.0))) };
        match result {
            Ok(_) => Ok(()),
            Err(err) => {
                unsafe {
                    let _ = GlobalFree(Some(memory));
                }
                Err(format!("Unable to place the image on the clipboard: {err}"))
            }
        }
    }

    fn png_to_clipboard_dib(png: &[u8]) -> Result<Vec<u8>, String> {
        let image = image::load_from_memory(png)
            .map_err(|err| format!("Unable to read the image for clipboard copy: {err}"))?
            .to_rgba8();
        let (width, height) = image.dimensions();
        if width == 0 || height == 0 {
            return Err("The image is empty.".into());
        }

        let pixel_bytes = width as usize * height as usize * 4;
        let mut dib = Vec::with_capacity(40 + pixel_bytes);

        push_u32(&mut dib, 40);
        push_i32(&mut dib, width as i32);
        push_i32(&mut dib, height as i32);
        push_u16(&mut dib, 1);
        push_u16(&mut dib, 32);
        push_u32(&mut dib, BI_RGB.0);
        push_u32(&mut dib, pixel_bytes as u32);
        push_i32(&mut dib, 0);
        push_i32(&mut dib, 0);
        push_u32(&mut dib, 0);
        push_u32(&mut dib, 0);

        for y in (0..height).rev() {
            for x in 0..width {
                let pixel = image.get_pixel(x, y).0;
                dib.extend_from_slice(&[pixel[2], pixel[1], pixel[0], pixel[3]]);
            }
        }

        Ok(dib)
    }

    fn push_u16(buffer: &mut Vec<u8>, value: u16) {
        buffer.extend_from_slice(&value.to_le_bytes());
    }

    fn push_u32(buffer: &mut Vec<u8>, value: u32) {
        buffer.extend_from_slice(&value.to_le_bytes());
    }

    fn push_i32(buffer: &mut Vec<u8>, value: i32) {
        buffer.extend_from_slice(&value.to_le_bytes());
    }

    struct ClipboardGuard;

    impl Drop for ClipboardGuard {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseClipboard();
            }
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::{CaptureResult, ScreenBounds};

    pub fn capture_screen() -> Result<CaptureResult, String> {
        Err("This screenshot implementation uses Windows GDI. Please run it on Windows.".into())
    }

    pub fn capture_region(
        _left: i32,
        _top: i32,
        _width: i32,
        _height: i32,
    ) -> Result<CaptureResult, String> {
        capture_screen()
    }

    pub fn screen_bounds() -> Result<ScreenBounds, String> {
        Err("This screenshot implementation uses Windows GDI. Please run it on Windows.".into())
    }

    pub fn copy_png_to_clipboard(_png: &[u8]) -> Result<(), String> {
        Err("Image clipboard copy is only implemented on Windows.".into())
    }
}

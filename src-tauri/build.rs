/// Paths listed in `bundle.icon` in `tauri.conf.json` (keep the two in sync).
const BUNDLE_ICON_PATHS: &[&str] = &[
    "icons/16x16.png",
    "icons/20x20.png",
    "icons/24x24.png",
    "icons/30x30.png",
    "icons/32x32.png",
    "icons/36x36.png",
    "icons/40x40.png",
    "icons/44x44.png",
    "icons/48x48.png",
    "icons/64x64.png",
    "icons/96x96.png",
    "icons/128x128.png",
    "icons/150x150.png",
    "icons/128x128@2x.png",
    "icons/256x256.png",
    "icons/512x512.png",
    "icons/1024x1024.png",
    "icons/icon.icns",
    "icons/icon.ico",
];

fn main() {
    for path in BUNDLE_ICON_PATHS {
        println!("cargo:rerun-if-changed={}", path);
    }

    tauri_build::build();

    for path in BUNDLE_ICON_PATHS {
        if !std::path::Path::new(path).exists() {
            println!(
                "cargo:warning=missing {}; run `npm run icons:regen` in project root",
                path
            );
        }
    }

    #[cfg(windows)]
    {
        let path = std::path::Path::new("icons/icon.ico");
        if path.exists() {
            if let Ok(bytes) = std::fs::read(path) {
                if let Ok(icon_dir) = ico::IconDir::read(std::io::Cursor::new(bytes)) {
                    let mut sizes: Vec<u32> = icon_dir
                        .entries()
                        .iter()
                        .map(|e| {
                            let w = e.width();
                            if w == 0 { 256 } else { u32::from(w) }
                        })
                        .collect();
                    sizes.sort_unstable();
                    println!(
                        "cargo:warning=icon.ico embedded layers (px): {}",
                        sizes
                            .iter()
                            .map(|s| s.to_string())
                            .collect::<Vec<_>>()
                            .join(",")
                    );
                    // Per https://v2.tauri.app/develop/icons/ — ICO must include these layers (256 is the 256×256 image).
                    let required = [16u32, 24, 32, 48, 64, 256];
                    for need in required {
                        let ok = sizes.iter().any(|&s| s == need);
                        if !ok {
                            println!(
                                "cargo:warning=icon.ico missing recommended {}px layer; run `npm run icons:regen` in project root",
                                need
                            );
                        }
                    }
                } else {
                    println!("cargo:warning=icon.ico could not be parsed as ICO");
                }
            }
        }
    }
}

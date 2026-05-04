fn main() {
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.icns");
    println!("cargo:rerun-if-changed=icons/32x32.png");
    println!("cargo:rerun-if-changed=icons/128x128.png");
    println!("cargo:rerun-if-changed=icons/128x128@2x.png");
    println!("cargo:rerun-if-changed=icons/512x512.png");
    println!("cargo:rerun-if-changed=icons/1024x1024.png");
    tauri_build::build();

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
        } else {
            println!("cargo:warning=icons/icon.ico missing");
        }
    }
}

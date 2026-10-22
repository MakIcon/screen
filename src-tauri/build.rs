fn main() {
    // Recompile the executable's resources when the shared icon set changes.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build();

    // Tauri embeds a manifest in the app binary, but Cargo's unit-test binaries
    // also link native dialogs and need Common Controls v6 for TaskDialogIndirect.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
        // The app already receives a manifest through Tauri's resource.lib.
        println!("cargo:rustc-link-arg-bin=screen=/MANIFEST:NO");
    }
}

fn main() {
    // Recompile the executable's resources when the shared icon set changes.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("no app data dir");
            std::fs::create_dir_all(&app_data_dir).ok();
            let db_path = app_data_dir.join("suivi_cyclisme.db");
            if !db_path.exists() {
                let resource_path = app
                    .path()
                    .resolve("resources/suivi_cyclisme.db", tauri::path::BaseDirectory::Resource)
                    .expect("failed to resolve seed db resource");
                std::fs::copy(&resource_path, &db_path)
                    .expect("failed to copy seed database");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

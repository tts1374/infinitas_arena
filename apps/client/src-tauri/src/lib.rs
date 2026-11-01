mod commands;
mod models;
mod parsers;
mod watchers;

use commands::{
    get_source_watcher_state, pick_directory, start_source_watcher, stop_source_watcher,
    validate_source_directory, write_e2e_binary_file, write_e2e_text_file,
    save_event_result_json,
};
use commands::save_local_result_json;
use commands::show_match_history_window;
use watchers::SourceWatcherManager;

#[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
fn should_skip_deep_link_registration() -> bool {
    match std::env::var("INF_ARENA_DISABLE_DEEP_LINK_REGISTER") {
        Ok(value) => {
            let normalized = value.trim().to_ascii_lowercase();
            matches!(normalized.as_str(), "1" | "true" | "yes" | "on")
        }
        Err(_) => false,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_tts::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|_app| {
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;

                if !should_skip_deep_link_registration() {
                    _app.deep_link().register_all()?;
                }
            }

            Ok(())
        })
        .manage(SourceWatcherManager::default())
        .invoke_handler(tauri::generate_handler![
            get_source_watcher_state,
            pick_directory,
            save_local_result_json,
            save_event_result_json,
            show_match_history_window,
            start_source_watcher,
            stop_source_watcher,
            validate_source_directory,
            write_e2e_binary_file,
            write_e2e_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

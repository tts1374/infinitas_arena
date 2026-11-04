mod commands;
mod models;
mod parsers;
mod watchers;
use tauri::Manager;

use commands::{
    get_source_watcher_state, pick_directory, start_source_watcher, stop_source_watcher,
    validate_source_directory, write_e2e_binary_file, write_e2e_text_file,
    save_event_result_json,
};
use commands::save_local_result_json;
use commands::show_match_history_window;
use watchers::SourceWatcherManager;
use commands::{dev_control_identity, dev_control_state, dev_control_command, dev_control_poll,
    dev_control_report, dev_control_finish, dev_control_export, dev_control_restart, dev_control_adapter_state, dev_control_capture, dev_control_commit_capture, dev_control_focus};

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
        .on_window_event(|window, event| {
            if cfg!(debug_assertions) && window.label() == "dev-control" && window.app_handle().config().identifier.starts_with("com.infinitas.arena.dev.") {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
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
            write_e2e_text_file,
            dev_control_identity,
            dev_control_state,
            dev_control_command,
            dev_control_poll,
            dev_control_adapter_state,
            dev_control_report,
            dev_control_finish,
            dev_control_export,
            dev_control_capture,
            dev_control_commit_capture,
            dev_control_focus,
            dev_control_restart
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use std::{fs, path::{Path, PathBuf}};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const EVENT_RESULT_DIRECTORY_NAME: &str = "event-results";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveEventResultRequest {
    event_id: String,
    json_text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveEventResultResponse {
    file_path: String,
}

#[tauri::command]
pub fn save_event_result_json(app: AppHandle, request: SaveEventResultRequest) -> Result<SaveEventResultResponse, String> {
    let base_dir = app.path().app_local_data_dir()
        .map_err(|error| format!("Failed to resolve app local data directory: {error}"))?;
    let result_dir = base_dir.join(EVENT_RESULT_DIRECTORY_NAME);
    fs::create_dir_all(&result_dir)
        .map_err(|error| format!("Failed to create event result directory: {error}"))?;
    let file_path = result_dir.join(build_event_result_file_name(&request.event_id));
    write_json_atomic(&file_path, &request.json_text)?;
    Ok(SaveEventResultResponse { file_path: file_path.to_string_lossy().into_owned() })
}

fn build_event_result_file_name(event_id: &str) -> String {
    let sanitized: String = event_id.chars().map(|character| match character {
        'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' => character,
        _ => '-',
    }).collect();
    let trimmed = sanitized.trim_matches('-');
    format!("{}.json", if trimmed.is_empty() { "event" } else { trimmed })
}

fn write_json_atomic(file_path: &Path, json_text: &str) -> Result<(), String> {
    let temp_path: PathBuf = file_path.with_extension("json.tmp");
    fs::write(&temp_path, json_text.replace("\r\n", "\n").as_bytes())
        .map_err(|error| format!("Failed to write temp event result file: {error}"))?;
    if file_path.exists() {
        fs::remove_file(file_path).map_err(|error| format!("Failed to replace event result file: {error}"))?;
    }
    fs::rename(&temp_path, file_path)
        .map_err(|error| format!("Failed to finalize event result file: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::build_event_result_file_name;

    #[test]
    fn event_result_file_name_is_scoped_to_one_safe_json_file() {
        assert_eq!(build_event_result_file_name("event-123"), "event-123.json");
        assert_eq!(build_event_result_file_name("../event/123"), "event-123.json");
        assert_eq!(build_event_result_file_name(""), "event.json");
    }
}

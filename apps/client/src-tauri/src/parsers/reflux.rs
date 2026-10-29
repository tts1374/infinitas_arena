use std::{
    collections::{HashMap, HashSet},
    env, fs,
    hash::{DefaultHasher, Hash, Hasher},
    path::{Path, PathBuf},
    thread,
    time::Duration,
};

use serde::Deserialize;
use serde_json::Value;

use crate::{
    models::{
        ParsedSourceChange, ParsedSourceObservation, ParsedSourceUnresolvedCase,
        ParsedSourceUnresolvedCaseKind, SourcePathsConfig, SourceType,
    },
    parsers::{runtime_alias::RuntimeAliasResolver, ParserInput, SourceParser},
};

const LATEST_DEBOUNCE_MS: u64 = 120;
const LATEST_PARSE_RETRY_COUNT: usize = 2;
const LATEST_PARSE_RETRY_DELAY_MS: u64 = 80;

const DIFF_CODES: [&str; 10] = [
    "SPB", "SPN", "SPH", "SPA", "SPL", "DPB", "DPN", "DPH", "DPA", "DPL",
];

#[derive(Clone, Debug, Deserialize)]
struct WorkerChartMasterSnapshot {
    #[serde(default)]
    charts: Vec<WorkerChartMasterChart>,
    #[serde(default)]
    aliases: HashMap<String, String>,
}

#[derive(Clone, Debug, Deserialize)]
struct WorkerChartMasterChart {
    play_style: String,
    difficulty: String,
    title: String,
    title_search_key: String,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct ChartIndexKey {
    play_style: String,
    difficulty: String,
    title_search_key: String,
}

#[derive(Clone, Debug, Default)]
struct AliasCatalog {
    alias_to_title_search_keys: HashMap<String, Vec<String>>,
    chart_index: HashSet<ChartIndexKey>,
}

impl AliasCatalog {
    fn has_alias_exact(&self, raw_alias: &str) -> bool {
        let alias = raw_alias.trim();
        !alias.is_empty() && self.alias_to_title_search_keys.contains_key(alias)
    }

    fn resolve_chart_candidates_exact(
        &self,
        raw_alias: &str,
        play_style: &str,
        difficulty: &str,
    ) -> Vec<String> {
        let alias = raw_alias.trim();
        if alias.is_empty() {
            return Vec::new();
        }

        let Some(title_search_keys) = self.alias_to_title_search_keys.get(alias) else {
            return Vec::new();
        };

        title_search_keys
            .iter()
            .filter(|title_search_key| {
                self.chart_index.contains(&ChartIndexKey {
                    play_style: play_style.to_string(),
                    difficulty: difficulty.to_string(),
                    title_search_key: (*title_search_key).clone(),
                })
            })
            .cloned()
            .collect()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct TrackerBestEntry {
    score: u32,
    misscount: Option<u32>,
}

#[derive(Clone, Debug, Default)]
struct TrackerCache {
    best_by_chart: HashMap<ChartIndexKey, TrackerBestEntry>,
}

#[derive(Clone, Debug)]
struct LatestRecord {
    timestamp: String,
    title: String,
    title2: String,
    play_style: String,
    difficulty: String,
    score: u32,
    misscount: u32,
    secondary_fingerprint: String,
}

#[derive(Clone, Debug)]
struct TitleResolutionAttempt {
    has_alias: bool,
    candidates: Vec<String>,
}

pub struct RefluxParser {
    latest_path: PathBuf,
    latest_path_key: String,
    tracker_path: PathBuf,
    tracker_path_key: String,
    alias_catalog: AliasCatalog,
    runtime_alias_resolver: Option<RuntimeAliasResolver>,
    tracker_cache: TrackerCache,
    last_content_hash: Option<u64>,
    last_secondary_fingerprint: Option<String>,
}

impl RefluxParser {
    pub fn new(source_paths: &SourcePathsConfig, api_base_url: Option<&str>) -> Self {
        Self::new_internal(
            source_paths,
            load_alias_catalog(),
            RuntimeAliasResolver::new("reflux", api_base_url),
        )
    }

    #[cfg(test)]
    fn new_with_catalog(source_paths: &SourcePathsConfig, alias_catalog: AliasCatalog) -> Self {
        Self::new_internal(source_paths, alias_catalog, None)
    }

    fn new_internal(
        source_paths: &SourcePathsConfig,
        alias_catalog: AliasCatalog,
        runtime_alias_resolver: Option<RuntimeAliasResolver>,
    ) -> Self {
        let latest_path = PathBuf::from(source_paths.reflux_latest_json.trim());
        let tracker_path = PathBuf::from(source_paths.reflux_tracker_tsv.trim());
        let tracker_cache =
            load_tracker_cache(&tracker_path, &alias_catalog).unwrap_or_else(|error| {
                eprintln!(
                    "reflux: tracker.tsv initial load failed ({}): {error}",
                    tracker_path.to_string_lossy()
                );
                TrackerCache::default()
            });

        Self {
            latest_path_key: path_key(&latest_path),
            latest_path,
            tracker_path_key: path_key(&tracker_path),
            tracker_path,
            alias_catalog,
            runtime_alias_resolver,
            tracker_cache,
            last_content_hash: None,
            last_secondary_fingerprint: None,
        }
    }

    fn reload_tracker_cache(&mut self) {
        match load_tracker_cache(&self.tracker_path, &self.alias_catalog) {
            Ok(cache) => {
                self.tracker_cache = cache;
            }
            Err(error) => {
                eprintln!(
                    "reflux: tracker.tsv reload failed ({}): {error}",
                    self.tracker_path.to_string_lossy()
                );
                self.tracker_cache = TrackerCache::default();
            }
        }
    }
}

impl SourceParser for RefluxParser {
    fn parse(&mut self, input: &ParserInput) -> Result<Option<ParsedSourceChange>, String> {
        let metadata = fs::metadata(&input.changed_path)
            .map_err(|error| format!("Failed to read {:?}: {error}", input.changed_path))?;
        let changed_path_key = path_key(&input.changed_path);

        if changed_path_key == self.tracker_path_key {
            self.reload_tracker_cache();
            return Ok(None);
        }

        if changed_path_key != self.latest_path_key {
            return Ok(None);
        }

        thread::sleep(Duration::from_millis(LATEST_DEBOUNCE_MS));
        let Some((raw_json, latest)) = read_latest_with_retry(&self.latest_path)? else {
            return Ok(None);
        };

        let content_hash = hash_text(&raw_json);
        if self.last_content_hash == Some(content_hash) {
            return Ok(None);
        }
        if self.last_secondary_fingerprint.as_deref() == Some(latest.secondary_fingerprint.as_str())
        {
            self.last_content_hash = Some(content_hash);
            return Ok(None);
        }
        self.last_content_hash = Some(content_hash);
        self.last_secondary_fingerprint = Some(latest.secondary_fingerprint.clone());

        let resolution = resolve_title_search_key(
            &latest,
            &self.alias_catalog,
            self.runtime_alias_resolver.as_mut(),
        );
        match resolution {
            Ok(title_search_key) => {
                let chart_key = ChartIndexKey {
                    play_style: latest.play_style.clone(),
                    difficulty: latest.difficulty.clone(),
                    title_search_key: title_search_key.clone(),
                };
                let best = self.tracker_cache.best_by_chart.get(&chart_key);

                let mut source_meta_extras = HashMap::new();
                source_meta_extras.insert(
                    "best_score".to_string(),
                    best.map(|entry| Value::from(entry.score))
                        .unwrap_or(Value::Null),
                );
                source_meta_extras.insert(
                    "best_misscount".to_string(),
                    best.and_then(|entry| entry.misscount)
                        .map(Value::from)
                        .unwrap_or(Value::Null),
                );
                source_meta_extras.insert("current_score".to_string(), Value::from(latest.score));
                source_meta_extras.insert(
                    "current_misscount".to_string(),
                    Value::from(latest.misscount),
                );

                Ok(Some(ParsedSourceChange {
                    source: SourceType::Reflux,
                    file_path: self.latest_path.to_string_lossy().into_owned(),
                    file_size_bytes: metadata.len(),
                    observations: vec![ParsedSourceObservation {
                        timestamp: latest.timestamp,
                        play_style: Some(latest.play_style),
                        difficulty: latest.difficulty,
                        title: latest.title,
                        title_search_key,
                        score: latest.score,
                        misscount: latest.misscount,
                        source_meta_extras: Some(source_meta_extras),
                    }],
                    unresolved_cases: Vec::new(),
                }))
            }
            Err((unresolved_title, candidate_count)) => Ok(Some(ParsedSourceChange {
                source: SourceType::Reflux,
                file_path: self.latest_path.to_string_lossy().into_owned(),
                file_size_bytes: metadata.len(),
                observations: Vec::new(),
                unresolved_cases: vec![ParsedSourceUnresolvedCase {
                    kind: ParsedSourceUnresolvedCaseKind::UnresolvedAlias,
                    timestamp: latest.timestamp,
                    play_style: latest.play_style,
                    difficulty: latest.difficulty,
                    title: unresolved_title,
                    title_search_key: None,
                    score: Some(latest.score),
                    misscount: Some(latest.misscount),
                    recent_candidate_count: Some(candidate_count),
                }],
            })),
        }
    }
}

fn read_latest_with_retry(path: &Path) -> Result<Option<(String, LatestRecord)>, String> {
    if !path.exists() {
        return Err(format!(
            "Failed to read {}: file does not exist.",
            path.to_string_lossy()
        ));
    }

    for attempt in 0..=LATEST_PARSE_RETRY_COUNT {
        let raw_json = fs::read_to_string(path)
            .map_err(|error| format!("Failed to read {}: {error}", path.to_string_lossy()))?;
        match parse_latest_record(&raw_json) {
            Ok(parsed) => return Ok(Some((raw_json, parsed))),
            Err(error) => {
                if attempt < LATEST_PARSE_RETRY_COUNT {
                    thread::sleep(Duration::from_millis(LATEST_PARSE_RETRY_DELAY_MS));
                    continue;
                }
                eprintln!(
                    "reflux: ignored latest.json update because it is not readable yet ({}): {error}",
                    path.to_string_lossy()
                );
                return Ok(None);
            }
        }
    }

    Ok(None)
}

fn parse_latest_record(raw_json: &str) -> Result<LatestRecord, String> {
    let root: Value = serde_json::from_str(raw_json)
        .map_err(|error| format!("Failed to parse latest.json payload: {error}"))?;
    let object = root
        .as_object()
        .ok_or_else(|| "latest.json root is not a JSON object.".to_string())?;

    let title = read_optional_text(object, "title");
    let title2 = read_optional_text(object, "title2");
    if title.is_empty() && title2.is_empty() {
        return Err("latest.json is missing both title and title2.".to_string());
    }

    let diff = read_required_text(object, "diff")?;
    let (play_style, difficulty) = map_diff_to_chart(diff.as_str())
        .ok_or_else(|| format!("latest.json contains unsupported diff: {diff}"))?;

    let score = parse_required_u32(object, "exscore")?;
    let bad = parse_required_u32(object, "bad")?;
    let poor = parse_required_u32(object, "poor")?;
    let assist = read_optional_text(object, "assist");
    let lamp = read_optional_text(object, "lamp");
    let playtype = read_optional_text(object, "playtype");
    let timestamp = read_optional_text(object, "timestamp");

    if let Some(playtype_style) = normalize_play_style(playtype.as_str()) {
        if playtype_style != play_style {
            eprintln!(
                "reflux warning: playtype mismatch (diff={diff}, playtype={}, title={})",
                playtype,
                if title.is_empty() {
                    title2.as_str()
                } else {
                    title.as_str()
                }
            );
        }
    }

    let misscount = if is_assist_enabled(assist.as_str()) || is_failed_lamp(lamp.as_str()) {
        9999
    } else {
        bad.saturating_add(poor)
    };

    let title_for_fingerprint = if title.is_empty() {
        title2.as_str()
    } else {
        title.as_str()
    };
    let timestamp_for_fingerprint = if timestamp.trim().is_empty() {
        "-"
    } else {
        timestamp.as_str()
    };
    let secondary_fingerprint = format!(
        "{timestamp_for_fingerprint}::{title_for_fingerprint}::{diff}::{score}::{bad}::{poor}"
    );

    Ok(LatestRecord {
        timestamp,
        title: if title.is_empty() {
            title2.clone()
        } else {
            title
        },
        title2,
        play_style: play_style.to_string(),
        difficulty: difficulty.to_string(),
        score,
        misscount,
        secondary_fingerprint,
    })
}

fn read_required_text(
    object: &serde_json::Map<String, Value>,
    field_name: &str,
) -> Result<String, String> {
    let value = read_optional_text(object, field_name);
    if value.is_empty() {
        return Err(format!("latest.json is missing field '{field_name}'."));
    }
    Ok(value)
}

fn read_optional_text(object: &serde_json::Map<String, Value>, field_name: &str) -> String {
    let Some(value) = object.get(field_name) else {
        return String::new();
    };
    match value {
        Value::String(raw) => raw.trim().to_string(),
        Value::Number(number) => number.to_string(),
        Value::Bool(boolean) => {
            if *boolean {
                "true".to_string()
            } else {
                "false".to_string()
            }
        }
        _ => String::new(),
    }
}

fn parse_required_u32(
    object: &serde_json::Map<String, Value>,
    field_name: &str,
) -> Result<u32, String> {
    let Some(value) = object.get(field_name) else {
        return Err(format!("latest.json is missing field '{field_name}'."));
    };
    parse_u32_value(value)
        .ok_or_else(|| format!("latest.json field '{field_name}' is not a non-negative integer."))
}

fn parse_u32_value(value: &Value) -> Option<u32> {
    match value {
        Value::Number(number) => {
            if let Some(raw) = number.as_u64() {
                u32::try_from(raw).ok()
            } else if let Some(raw) = number.as_i64() {
                if raw < 0 {
                    None
                } else {
                    u32::try_from(raw as u64).ok()
                }
            } else {
                None
            }
        }
        Value::String(raw) => parse_optional_u32_text(raw),
        _ => None,
    }
}

fn parse_optional_u32_text(raw: &str) -> Option<u32> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "-" {
        return None;
    }
    if !trimmed.chars().all(|character| character.is_ascii_digit()) {
        return None;
    }
    trimmed.parse::<u32>().ok()
}

fn map_diff_to_chart(diff: &str) -> Option<(&'static str, &'static str)> {
    let normalized = diff.trim().to_ascii_uppercase();
    match normalized.as_str() {
        "SPB" => Some(("SP", "BEGINNER")),
        "SPN" => Some(("SP", "NORMAL")),
        "SPH" => Some(("SP", "HYPER")),
        "SPA" => Some(("SP", "ANOTHER")),
        "SPL" => Some(("SP", "LEGGENDARIA")),
        "DPB" => Some(("DP", "BEGINNER")),
        "DPN" => Some(("DP", "NORMAL")),
        "DPH" => Some(("DP", "HYPER")),
        "DPA" => Some(("DP", "ANOTHER")),
        "DPL" => Some(("DP", "LEGGENDARIA")),
        _ => None,
    }
}

fn normalize_chart_difficulty(raw_difficulty: &str) -> Option<&'static str> {
    let normalized = raw_difficulty
        .trim()
        .to_ascii_uppercase()
        .replace([' ', '-', '_'], "");
    match normalized.as_str() {
        "B" | "BEGINNER" | "SPB" | "DPB" => Some("BEGINNER"),
        "N" | "NORMAL" | "NOVICE" | "SPN" | "DPN" => Some("NORMAL"),
        "H" | "HYPER" | "SPH" | "DPH" => Some("HYPER"),
        "A" | "ANOTHER" | "SPA" | "DPA" => Some("ANOTHER"),
        "L" | "LEGGENDARIA" | "SPL" | "DPL" => Some("LEGGENDARIA"),
        _ => None,
    }
}

fn normalize_play_style(raw_play_style: &str) -> Option<&'static str> {
    match raw_play_style.trim().to_ascii_uppercase().as_str() {
        "SP" | "SINGLE" | "SINGLEPLAY" => Some("SP"),
        "DP" | "DOUBLE" | "DOUBLEPLAY" => Some("DP"),
        _ => None,
    }
}

fn is_assist_enabled(raw_assist: &str) -> bool {
    let normalized = raw_assist.trim().to_ascii_uppercase();
    !normalized.is_empty() && normalized != "OFF"
}

fn is_failed_lamp(raw_lamp: &str) -> bool {
    matches!(
        raw_lamp.trim().to_ascii_uppercase().as_str(),
        "F" | "FAILED"
    )
}

fn resolve_title_search_key(
    latest: &LatestRecord,
    catalog: &AliasCatalog,
    mut runtime_alias_resolver: Option<&mut RuntimeAliasResolver>,
) -> Result<String, (String, u32)> {
    let primary_title = latest.title.trim();
    let fallback_title = latest.title2.trim();

    let primary_attempt = resolve_title_attempt(
        catalog,
        &mut runtime_alias_resolver,
        primary_title,
        latest.play_style.as_str(),
        latest.difficulty.as_str(),
    );
    if primary_attempt.has_alias {
        return choose_candidate(primary_title, primary_attempt);
    }

    let fallback_attempt = resolve_title_attempt(
        catalog,
        &mut runtime_alias_resolver,
        fallback_title,
        latest.play_style.as_str(),
        latest.difficulty.as_str(),
    );
    if fallback_attempt.has_alias {
        return choose_candidate(fallback_title, fallback_attempt);
    }

    let unresolved_title = if !primary_title.is_empty() {
        primary_title.to_string()
    } else {
        fallback_title.to_string()
    };
    Err((unresolved_title, 0))
}

fn resolve_title_attempt(
    catalog: &AliasCatalog,
    runtime_alias_resolver: &mut Option<&mut RuntimeAliasResolver>,
    raw_title: &str,
    play_style: &str,
    difficulty: &str,
) -> TitleResolutionAttempt {
    let has_alias = catalog.has_alias_exact(raw_title);
    let candidates = if has_alias {
        catalog.resolve_chart_candidates_exact(raw_title, play_style, difficulty)
    } else {
        Vec::new()
    };
    if has_alias {
        return TitleResolutionAttempt {
            has_alias,
            candidates,
        };
    }

    if let Some(resolver) = runtime_alias_resolver.as_deref_mut() {
        match resolver.resolve_exact(raw_title, play_style, difficulty) {
            Ok(result) => {
                return TitleResolutionAttempt {
                    has_alias: result.alias_exists,
                    candidates: result.title_search_keys,
                };
            }
            Err(error) => {
                eprintln!(
                    "reflux: runtime alias resolve failed for '{}' / {} / {}: {}",
                    raw_title, play_style, difficulty, error
                );
            }
        }
    }

    TitleResolutionAttempt {
        has_alias: false,
        candidates: Vec::new(),
    }
}

fn choose_candidate(
    unresolved_title: &str,
    attempt: TitleResolutionAttempt,
) -> Result<String, (String, u32)> {
    match attempt.candidates.as_slice() {
        [single] => Ok(single.clone()),
        _ => Err((
            unresolved_title.to_string(),
            attempt.candidates.len().try_into().unwrap_or(u32::MAX),
        )),
    }
}

fn load_alias_catalog() -> AliasCatalog {
    let raw_json = include_str!("../../../../worker/src/master/generated/iidx-song-master.json");
    let snapshot = match serde_json::from_str::<WorkerChartMasterSnapshot>(raw_json) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            eprintln!("reflux: failed to load alias catalog from chart master: {error}");
            return AliasCatalog::default();
        }
    };

    let mut alias_to_title_search_keys = HashMap::new();
    let mut chart_index = HashSet::new();

    for chart in &snapshot.charts {
        let Some(play_style) = normalize_play_style(chart.play_style.as_str()) else {
            continue;
        };
        let Some(difficulty) = normalize_chart_difficulty(chart.difficulty.as_str()) else {
            continue;
        };
        let title_search_key = chart.title_search_key.trim();
        if title_search_key.is_empty() {
            continue;
        }

        chart_index.insert(ChartIndexKey {
            play_style: play_style.to_string(),
            difficulty: difficulty.to_string(),
            title_search_key: title_search_key.to_string(),
        });
        insert_alias_mapping(
            &mut alias_to_title_search_keys,
            chart.title.as_str(),
            title_search_key,
        );
    }

    for (alias, title_search_key) in &snapshot.aliases {
        insert_alias_mapping(&mut alias_to_title_search_keys, alias, title_search_key);
    }

    AliasCatalog {
        alias_to_title_search_keys,
        chart_index,
    }
}

fn insert_alias_mapping(
    alias_to_title_search_keys: &mut HashMap<String, Vec<String>>,
    raw_alias: &str,
    raw_title_search_key: &str,
) {
    let alias = raw_alias.trim();
    let title_search_key = raw_title_search_key.trim();
    if alias.is_empty() || title_search_key.is_empty() {
        return;
    }

    let entry = alias_to_title_search_keys
        .entry(alias.to_string())
        .or_default();
    if !entry.iter().any(|value| value == title_search_key) {
        entry.push(title_search_key.to_string());
    }
}

#[derive(Clone, Debug)]
struct DiffColumnIndices {
    play_style: &'static str,
    difficulty: &'static str,
    lamp_index: usize,
    score_index: usize,
    misscount_index: usize,
}

fn load_tracker_cache(path: &Path, catalog: &AliasCatalog) -> Result<TrackerCache, String> {
    if !path.exists() {
        return Err(format!(
            "Failed to read {}: file does not exist.",
            path.to_string_lossy()
        ));
    }
    let raw_tsv = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read {}: {error}", path.to_string_lossy()))?;
    parse_tracker_cache(&raw_tsv, catalog)
}

fn parse_tracker_cache(raw_tsv: &str, catalog: &AliasCatalog) -> Result<TrackerCache, String> {
    let mut lines = raw_tsv.lines();
    let header = lines
        .next()
        .ok_or_else(|| "tracker.tsv is missing a header row.".to_string())?;
    let columns = header.split('\t').collect::<Vec<_>>();
    let title_index = find_header_index(&columns, "title")
        .ok_or_else(|| "tracker.tsv header is missing 'title'.".to_string())?;

    let diff_indices = DIFF_CODES
        .iter()
        .filter_map(|diff| {
            let (play_style, difficulty) = map_diff_to_chart(diff)?;
            let lamp_index = find_header_index(&columns, format!("{diff} Lamp").as_str())?;
            let score_index = find_header_index(&columns, format!("{diff} EX Score").as_str())?;
            let misscount_index =
                find_header_index(&columns, format!("{diff} Miss Count").as_str())?;
            Some(DiffColumnIndices {
                play_style,
                difficulty,
                lamp_index,
                score_index,
                misscount_index,
            })
        })
        .collect::<Vec<_>>();

    if diff_indices.is_empty() {
        return Err("tracker.tsv header does not contain chart columns.".to_string());
    }

    let mut best_by_chart = HashMap::new();
    for line in lines {
        if line.trim().is_empty() {
            continue;
        }
        let row = line.split('\t').collect::<Vec<_>>();
        let title = row.get(title_index).copied().unwrap_or("").trim();
        if title.is_empty() {
            continue;
        }

        for diff in &diff_indices {
            let raw_score = row.get(diff.score_index).copied().unwrap_or("");
            let Some(score) = parse_optional_u32_text(raw_score) else {
                continue;
            };

            let raw_lamp = row.get(diff.lamp_index).copied().unwrap_or("");
            let raw_misscount = row.get(diff.misscount_index).copied().unwrap_or("");
            let misscount = normalize_tracker_misscount(raw_lamp, raw_misscount);

            let candidates =
                catalog.resolve_chart_candidates_exact(title, diff.play_style, diff.difficulty);
            if candidates.len() != 1 {
                continue;
            }
            let title_search_key = candidates[0].clone();
            let key = ChartIndexKey {
                play_style: diff.play_style.to_string(),
                difficulty: diff.difficulty.to_string(),
                title_search_key,
            };
            let next = TrackerBestEntry { score, misscount };
            match best_by_chart.get(&key).copied() {
                Some(current) => {
                    if is_better_tracker_entry(next, current) {
                        best_by_chart.insert(key, next);
                    }
                }
                None => {
                    best_by_chart.insert(key, next);
                }
            }
        }
    }

    Ok(TrackerCache { best_by_chart })
}

fn normalize_tracker_misscount(raw_lamp: &str, raw_misscount: &str) -> Option<u32> {
    if is_failed_lamp(raw_lamp) {
        return Some(9999);
    }

    let normalized = raw_misscount.trim();
    if normalized == "-" {
        return Some(9999);
    }
    parse_optional_u32_text(normalized)
}

fn is_better_tracker_entry(next: TrackerBestEntry, current: TrackerBestEntry) -> bool {
    if next.score != current.score {
        return next.score > current.score;
    }
    normalized_bp_rank(next.misscount) < normalized_bp_rank(current.misscount)
}

fn normalized_bp_rank(misscount: Option<u32>) -> u32 {
    misscount.unwrap_or(u32::MAX)
}

fn find_header_index(columns: &[&str], target: &str) -> Option<usize> {
    columns
        .iter()
        .position(|column| column.trim().eq_ignore_ascii_case(target))
}

fn hash_text(raw_text: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    raw_text.hash(&mut hasher);
    hasher.finish()
}

fn path_key(path: &Path) -> String {
    let normalized = path
        .canonicalize()
        .unwrap_or_else(|_| {
            if path.is_absolute() {
                path.to_path_buf()
            } else {
                env::current_dir()
                    .map(|current_dir| current_dir.join(path))
                    .unwrap_or_else(|_| path.to_path_buf())
            }
        })
        .to_string_lossy()
        .replace('/', "\\");

    normalized
        .strip_prefix("\\\\?\\UNC\\")
        .map(|remainder| format!("\\\\{remainder}"))
        .or_else(|| normalized.strip_prefix("\\\\?\\").map(str::to_string))
        .unwrap_or(normalized)
        .to_lowercase()
}

#[cfg(test)]
mod tests {
    use std::{
        collections::{HashMap, HashSet},
        env, fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use serde_json::Value;

    use crate::{
        models::{ParsedSourceObservation, ParsedSourceUnresolvedCaseKind, SourcePathsConfig},
        parsers::{
            reflux::{
                parse_tracker_cache, AliasCatalog, ChartIndexKey, RefluxParser, TrackerBestEntry,
            },
            ParserInput, SourceParser,
        },
    };

    #[test]
    fn reflux_empty_control_baseline_emits_no_alias_error_or_replayed_observation() {
        let temp_dir=create_temp_dir("reflux-empty-baseline");
        let latest_path=temp_dir.join("latest.json");let tracker_path=temp_dir.join("tracker.tsv");
        write_file(&tracker_path,"title\tSPA Lamp\tSPA EX Score\tSPA Miss Count\n");
        let mut parser=RefluxParser::new_with_catalog(&SourcePathsConfig {
            reflux_latest_json:latest_path.to_string_lossy().into_owned(),reflux_tracker_tsv:tracker_path.to_string_lossy().into_owned(),..SourcePathsConfig::default()
        },build_catalog(&[("Song A","Song A","SP","ANOTHER")]));
        let input=ParserInput{changed_path:latest_path.clone()};
        let play=r#"{"timestamp":"20261029-190000","title":"Song A","diff":"SPA","exscore":"700","bad":"4","poor":"6","assist":"OFF","lamp":"AC","playtype":"SP"}"#;
        write_file(&latest_path,"{}");assert!(parser.parse(&input).unwrap().is_none());
        write_file(&latest_path,play);let change=parser.parse(&input).unwrap().unwrap();
        assert!(change.unresolved_cases.is_empty());assert_eq!(change.observations.len(),1);assert_eq!(change.observations[0].score,700);
        write_file(&latest_path,"{}");assert!(parser.parse(&input).unwrap().is_none());
        write_file(&latest_path,play);assert!(parser.parse(&input).unwrap().is_none(),"empty reset must not make the last play new again");
        let _=fs::remove_dir_all(temp_dir);
    }
    #[test]
    fn reflux_parser_emits_observation_with_tracker_best_values() {
        let temp_dir = create_temp_dir("reflux-observation");
        let latest_path = temp_dir.join("latest.json");
        let tracker_path = temp_dir.join("tracker.tsv");

        write_file(
            &tracker_path,
            "title\tDPL Lamp\tDPL EX Score\tDPL Miss Count\nSong A\tAC\t2700\t11\n",
        );
        write_file(
            &latest_path,
            r#"{"title":"Song A","title2":"Song A Alt","diff":"DPL","exscore":"2653","bad":"4","poor":"13","assist":"OFF","lamp":"AC","playtype":"DP"}"#,
        );

        let mut parser = RefluxParser::new_with_catalog(
            &SourcePathsConfig {
                reflux_latest_json: latest_path.to_string_lossy().into_owned(),
                reflux_tracker_tsv: tracker_path.to_string_lossy().into_owned(),
                ..SourcePathsConfig::default()
            },
            build_catalog(&[("Song A", "Song A", "DP", "LEGGENDARIA")]),
        );

        let parsed_change = parser
            .parse(&ParserInput {
                changed_path: latest_path.clone(),
            })
            .expect("parse should succeed")
            .expect("parse should emit a change");

        assert!(parsed_change.unresolved_cases.is_empty());
        assert_eq!(parsed_change.observations.len(), 1);

        let observation = &parsed_change.observations[0];
        assert_eq!(observation.play_style.as_deref(), Some("DP"));
        assert_eq!(observation.difficulty, "LEGGENDARIA");
        assert_eq!(observation.title_search_key, "Song A");
        assert_eq!(observation.score, 2653);
        assert_eq!(observation.misscount, 17);
        assert_source_meta_extras(observation, Some(2700), Some(11), 2653, 17);

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn reflux_parser_uses_title2_when_title_alias_is_missing() {
        let temp_dir = create_temp_dir("reflux-title2");
        let latest_path = temp_dir.join("latest.json");
        let tracker_path = temp_dir.join("tracker.tsv");

        write_file(
            &tracker_path,
            "title\tDPL Lamp\tDPL EX Score\tDPL Miss Count\n",
        );
        write_file(
            &latest_path,
            r#"{"title":"Unknown Song","title2":"Song A Alt","diff":"DPL","exscore":"2300","bad":"1","poor":"2","assist":"OFF","lamp":"AC","playtype":"DP"}"#,
        );

        let mut parser = RefluxParser::new_with_catalog(
            &SourcePathsConfig {
                reflux_latest_json: latest_path.to_string_lossy().into_owned(),
                reflux_tracker_tsv: tracker_path.to_string_lossy().into_owned(),
                ..SourcePathsConfig::default()
            },
            build_catalog(&[("Song A Alt", "Song A", "DP", "LEGGENDARIA")]),
        );

        let parsed_change = parser
            .parse(&ParserInput {
                changed_path: latest_path.clone(),
            })
            .expect("parse should succeed")
            .expect("parse should emit a change");

        assert!(parsed_change.unresolved_cases.is_empty());
        assert_eq!(parsed_change.observations.len(), 1);
        assert_eq!(parsed_change.observations[0].title_search_key, "Song A");

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn reflux_parser_emits_unresolved_alias_when_chart_is_not_unique() {
        let temp_dir = create_temp_dir("reflux-unresolved");
        let latest_path = temp_dir.join("latest.json");
        let tracker_path = temp_dir.join("tracker.tsv");

        write_file(
            &tracker_path,
            "title\tDPL Lamp\tDPL EX Score\tDPL Miss Count\n",
        );
        write_file(
            &latest_path,
            r#"{"title":"Song A","title2":"Song A Alt","diff":"DPL","exscore":"2100","bad":"3","poor":"4","assist":"OFF","lamp":"AC","playtype":"DP"}"#,
        );

        let mut parser = RefluxParser::new_with_catalog(
            &SourcePathsConfig {
                reflux_latest_json: latest_path.to_string_lossy().into_owned(),
                reflux_tracker_tsv: tracker_path.to_string_lossy().into_owned(),
                ..SourcePathsConfig::default()
            },
            build_catalog(&[
                ("Song A", "Song A#1", "DP", "LEGGENDARIA"),
                ("Song A", "Song A#2", "DP", "LEGGENDARIA"),
            ]),
        );

        let parsed_change = parser
            .parse(&ParserInput {
                changed_path: latest_path.clone(),
            })
            .expect("parse should succeed")
            .expect("parse should emit a change");

        assert!(parsed_change.observations.is_empty());
        assert_eq!(parsed_change.unresolved_cases.len(), 1);
        assert_eq!(
            parsed_change.unresolved_cases[0].kind,
            ParsedSourceUnresolvedCaseKind::UnresolvedAlias
        );
        assert_eq!(
            parsed_change.unresolved_cases[0].recent_candidate_count,
            Some(2)
        );

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn reflux_parser_skips_repeated_payloads_by_fingerprint() {
        let temp_dir = create_temp_dir("reflux-dedupe");
        let latest_path = temp_dir.join("latest.json");
        let tracker_path = temp_dir.join("tracker.tsv");

        write_file(
            &tracker_path,
            "title\tDPL Lamp\tDPL EX Score\tDPL Miss Count\n",
        );
        write_file(
            &latest_path,
            r#"{"title":"Song A","title2":"Song A Alt","diff":"DPL","exscore":"2000","bad":"5","poor":"6","assist":"OFF","lamp":"AC","playtype":"DP","gaugepercent":"88"}"#,
        );

        let mut parser = RefluxParser::new_with_catalog(
            &SourcePathsConfig {
                reflux_latest_json: latest_path.to_string_lossy().into_owned(),
                reflux_tracker_tsv: tracker_path.to_string_lossy().into_owned(),
                ..SourcePathsConfig::default()
            },
            build_catalog(&[("Song A", "Song A", "DP", "LEGGENDARIA")]),
        );

        let first = parser
            .parse(&ParserInput {
                changed_path: latest_path.clone(),
            })
            .expect("first parse should succeed");
        assert!(first.is_some());

        write_file(
            &latest_path,
            r#"{"title":"Song A","title2":"Song A Alt","diff":"DPL","exscore":"2000","bad":"5","poor":"6","assist":"OFF","lamp":"AC","playtype":"DP","gaugepercent":"99"}"#,
        );

        let second = parser
            .parse(&ParserInput {
                changed_path: latest_path.clone(),
            })
            .expect("second parse should succeed");
        assert!(second.is_none());

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn reflux_parser_allows_same_tuple_when_timestamp_changes() {
        let temp_dir = create_temp_dir("reflux-dedupe-timestamp");
        let latest_path = temp_dir.join("latest.json");
        let tracker_path = temp_dir.join("tracker.tsv");

        write_file(
            &tracker_path,
            "title\tDPL Lamp\tDPL EX Score\tDPL Miss Count\n",
        );
        write_file(
            &latest_path,
            r#"{"timestamp":"20260320-100000","title":"Song A","title2":"Song A Alt","diff":"DPL","exscore":"2000","bad":"5","poor":"6","assist":"OFF","lamp":"AC","playtype":"DP","gaugepercent":"88"}"#,
        );

        let mut parser = RefluxParser::new_with_catalog(
            &SourcePathsConfig {
                reflux_latest_json: latest_path.to_string_lossy().into_owned(),
                reflux_tracker_tsv: tracker_path.to_string_lossy().into_owned(),
                ..SourcePathsConfig::default()
            },
            build_catalog(&[("Song A", "Song A", "DP", "LEGGENDARIA")]),
        );

        let first = parser
            .parse(&ParserInput {
                changed_path: latest_path.clone(),
            })
            .expect("first parse should succeed");
        assert!(first.is_some());

        write_file(
            &latest_path,
            r#"{"timestamp":"20260320-100500","title":"Song A","title2":"Song A Alt","diff":"DPL","exscore":"2000","bad":"5","poor":"6","assist":"OFF","lamp":"AC","playtype":"DP","gaugepercent":"99"}"#,
        );

        let second = parser
            .parse(&ParserInput {
                changed_path: latest_path.clone(),
            })
            .expect("second parse should succeed");
        assert!(second.is_some());

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn parse_tracker_cache_prefers_higher_score_then_lower_bp() {
        let catalog = build_catalog(&[("Song A", "Song A", "DP", "LEGGENDARIA")]);
        let cache = parse_tracker_cache(
            "title\tDPL Lamp\tDPL EX Score\tDPL Miss Count\n\
            Song A\tAC\t2400\t40\n\
            Song A\tAC\t2500\t30\n\
            Song A\tAC\t2500\t20\n",
            &catalog,
        )
        .expect("tracker cache should parse");

        let key = ChartIndexKey {
            play_style: "DP".to_string(),
            difficulty: "LEGGENDARIA".to_string(),
            title_search_key: "Song A".to_string(),
        };
        assert_eq!(
            cache.best_by_chart.get(&key).copied(),
            Some(TrackerBestEntry {
                score: 2500,
                misscount: Some(20),
            })
        );
    }

    #[test]
    fn normalize_chart_difficulty_accepts_master_labels() {
        assert_eq!(super::normalize_chart_difficulty("ANOTHER"), Some("ANOTHER"));
        assert_eq!(super::normalize_chart_difficulty("hyper"), Some("HYPER"));
        assert_eq!(super::normalize_chart_difficulty("spn"), Some("NORMAL"));
        assert_eq!(super::normalize_chart_difficulty("dpl"), Some("LEGGENDARIA"));
    }

    fn assert_source_meta_extras(
        observation: &ParsedSourceObservation,
        expected_best_score: Option<u32>,
        expected_best_misscount: Option<u32>,
        expected_current_score: u32,
        expected_current_misscount: u32,
    ) {
        let extras = observation
            .source_meta_extras
            .as_ref()
            .expect("source_meta_extras should be present");
        assert_eq!(
            read_optional_u32(extras.get("best_score")),
            expected_best_score
        );
        assert_eq!(
            read_optional_u32(extras.get("best_misscount")),
            expected_best_misscount
        );
        assert_eq!(
            read_optional_u32(extras.get("current_score")),
            Some(expected_current_score)
        );
        assert_eq!(
            read_optional_u32(extras.get("current_misscount")),
            Some(expected_current_misscount)
        );
    }

    fn read_optional_u32(value: Option<&Value>) -> Option<u32> {
        match value {
            Some(Value::Number(number)) => number.as_u64().and_then(|raw| u32::try_from(raw).ok()),
            Some(Value::Null) | None => None,
            _ => None,
        }
    }

    fn build_catalog(entries: &[(&str, &str, &str, &str)]) -> AliasCatalog {
        let mut alias_to_title_search_keys: HashMap<String, Vec<String>> = HashMap::new();
        let mut chart_index = HashSet::new();

        for (alias, title_search_key, play_style, difficulty) in entries {
            alias_to_title_search_keys
                .entry((*alias).to_string())
                .or_default()
                .push((*title_search_key).to_string());
            chart_index.insert(ChartIndexKey {
                play_style: (*play_style).to_string(),
                difficulty: (*difficulty).to_string(),
                title_search_key: (*title_search_key).to_string(),
            });
        }

        AliasCatalog {
            alias_to_title_search_keys,
            chart_index,
        }
    }

    fn create_temp_dir(prefix: &str) -> PathBuf {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before epoch")
            .as_nanos();
        let temp_dir = env::temp_dir().join(format!("infinitas-arena-{prefix}-{unique_suffix}"));
        fs::create_dir_all(&temp_dir).expect("temp dir should be created");
        temp_dir
    }

    fn write_file(path: &PathBuf, contents: &str) {
        fs::write(path, contents).expect("fixture file should be written");
    }
}

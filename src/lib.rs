mod midi;
mod patch;
mod sysex;

use base64::Engine;
use chrono::Utc;
use midi::{MidiLog, Session};
use patch::{Patch, PATCH_SIZE};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::State;
use uuid::Uuid;

struct PatchSession {
    source_label: String,
    patch: Patch,
}
struct AppState {
    sessions: HashMap<String, PatchSession>,
    device_library: HashMap<String, Vec<u8>>,
    data_dir: PathBuf,
    busy: bool,
    live_midi: Option<LiveMidi>,
}
struct LiveMidi {
    input: usize,
    output: usize,
    session: Session,
    event_checks: u32,
}

fn data_directory() -> PathBuf {
    let documents =
        dirs::document_dir().unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    let preferred = documents.join("me-80-patch-editor");
    let legacy = documents.join("ME-80 Patch Lab");
    if preferred.exists() || !legacy.exists() {
        preferred
    } else {
        legacy
    }
}

fn string<'a>(body: &'a Value, key: &str) -> Result<&'a str, String> {
    body.get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("{key} must be a non-empty string."))
}
fn index(body: &Value, key: &str) -> Result<usize, String> {
    body.get(key)
        .and_then(Value::as_u64)
        .map(|v| v as usize)
        .ok_or_else(|| format!("{key} must be a non-negative integer."))
}
fn bytes(value: &Value, label: &str) -> Result<Vec<u8>, String> {
    let a = value
        .as_array()
        .ok_or_else(|| format!("{label} must be an array."))?;
    a.iter()
        .enumerate()
        .map(|(i, v)| {
            v.as_u64()
                .filter(|n| *n <= 255)
                .map(|n| n as u8)
                .ok_or_else(|| format!("{label}[{i}] must be a byte."))
        })
        .collect()
}
fn hex_bytes(value: &Value, label: &str) -> Result<Vec<u8>, String> {
    let text = value
        .as_str()
        .ok_or_else(|| format!("{label} must be a string."))?
        .trim();
    if text.is_empty() {
        return Ok(Vec::new());
    }
    text.split_whitespace()
        .enumerate()
        .map(|(i, s)| {
            if s.len() == 2 {
                u8::from_str_radix(s, 16)
                    .map_err(|_| format!("{label} token {i} is not a two-digit hexadecimal byte."))
            } else {
                Err(format!(
                    "{label} token {i} is not a two-digit hexadecimal byte."
                ))
            }
        })
        .collect()
}
fn same(a: &[u8], b: &[u8]) -> bool {
    a == b
}

fn session_view(id: &str, s: &PatchSession) -> Result<Value, String> {
    Ok(
        json!({"id":id,"sourceLabel":s.source_label,"decoded":patch::decode(&s.patch.data)?,"dataHex":s.patch.data.iter().map(|b|format!("{b:02X}")).collect::<Vec<_>>().join(" "),"changes":patch::differences(&s.patch.original,&s.patch.data)}),
    )
}
fn add_session(state: &mut AppState, label: String, data: Vec<u8>) -> Result<Value, String> {
    patch::validate(&data)?;
    let id = Uuid::new_v4().to_string();
    let s = PatchSession {
        source_label: label,
        patch: Patch {
            original: data.clone(),
            data,
        },
    };
    let view = session_view(&id, &s)?;
    state.sessions.insert(id, s);
    Ok(view)
}

fn latest_backup(data_dir: &Path) -> Result<PathBuf, String> {
    let dir = data_dir.join("backups");
    let mut paths = fs::read_dir(&dir)
        .map_err(|_| {
            format!(
                "No complete raw user backup was found under {}.",
                dir.display()
            )
        })?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("me80-user-backup-") && n.ends_with(".raw.json"))
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    paths.sort();
    paths.pop().ok_or_else(|| {
        format!(
            "No complete raw user backup was found under {}.",
            dir.display()
        )
    })
}

struct Backup {
    path: PathBuf,
    created_at: String,
    patches: Vec<(String, String, Vec<u8>, Value)>,
}
fn load_backup(path: PathBuf) -> Result<Backup, String> {
    let root: Value = serde_json::from_str(
        &fs::read_to_string(&path)
            .map_err(|e| format!("Could not read backup '{}': {e}", path.display()))?,
    )
    .map_err(|e| format!("Backup is not valid JSON: {e}"))?;
    if root.get("schema") != Some(&json!("me80-read-only-user-backup-v1"))
        || root.get("device") != Some(&json!("ME-80"))
    {
        return Err("Backup is not a supported ME-80 raw backup.".into());
    }
    let created = root
        .get("createdAt")
        .and_then(Value::as_str)
        .ok_or("Backup createdAt must be a string.")?
        .to_string();
    let entries = root
        .get("patches")
        .and_then(Value::as_array)
        .ok_or("Backup patches must be an array.")?;
    if entries.is_empty() {
        return Err("Backup must contain at least one patch.".into());
    }
    let mut out = Vec::new();
    for entry in entries {
        let label = entry
            .get("slot")
            .and_then(Value::as_str)
            .ok_or("Backup patch slot is missing.")?;
        let slot = sysex::slot(label)?;
        if !slot.user {
            return Err("Raw backup contains a preset slot.".into());
        }
        let address = hex_bytes(
            entry
                .get("addressHex")
                .ok_or("Backup addressHex is missing.")?,
            &format!("{} addressHex", slot.label),
        )?;
        if address != slot.address {
            return Err(format!(
                "{} address does not match its confirmed stored-slot address.",
                slot.label
            ));
        }
        let data = bytes(
            entry
                .get("dataDecimal")
                .ok_or("Backup patch data is missing.")?,
            &format!("{} dataDecimal", slot.label),
        )?;
        patch::validate(&data)?;
        if hex_bytes(
            entry.get("dataHex").ok_or("Backup dataHex is missing.")?,
            &format!("{} dataHex", slot.label),
        )? != data
        {
            return Err(format!(
                "{} hexadecimal and decimal data disagree.",
                slot.label
            ));
        }
        let request = hex_bytes(
            entry
                .get("requestHex")
                .ok_or("Backup requestHex is missing.")?,
            &format!("{} requestHex", slot.label),
        )?;
        if request != sysex::stored_rq1(&slot.label)? {
            return Err(format!(
                "{} request evidence is not its exact confirmed 71-byte RQ1.",
                slot.label
            ));
        }
        let response = bytes(
            entry
                .get("responseDecimal")
                .ok_or("Backup responseDecimal is missing.")?,
            &format!("{} responseDecimal", slot.label),
        )?;
        if hex_bytes(
            entry
                .get("responseHex")
                .ok_or("Backup responseHex is missing.")?,
            &format!("{} responseHex", slot.label),
        )? != response
        {
            return Err(format!(
                "{} hexadecimal and decimal response evidence disagree.",
                slot.label
            ));
        }
        let parsed = sysex::parse_dt1(&response)?
            .ok_or_else(|| format!("{} response evidence is not an ME-80 DT1.", slot.label))?;
        if parsed.device_id != sysex::DEVICE_ID
            || !parsed.checksum_valid
            || parsed.address != slot.address
            || parsed.data != data
        {
            return Err(format!("{} response evidence is invalid.", slot.label));
        }
        let checksum = hex_bytes(
            entry
                .get("receivedChecksumHex")
                .ok_or("Backup checksum is missing.")?,
            &format!("{} receivedChecksumHex", slot.label),
        )?;
        if checksum != [parsed.received_checksum] {
            return Err(format!(
                "{} recorded checksum disagrees with its response.",
                slot.label
            ));
        }
        let decoded = patch::decode(&data)?;
        let padded = decoded
            .pointer("/name/padded")
            .and_then(Value::as_str)
            .unwrap();
        if entry.get("name").and_then(Value::as_str) != Some(padded) {
            return Err(format!(
                "{} stored name does not match its decoded data.",
                slot.label
            ));
        }
        out.push((slot.label, patch::name(&data), data, decoded));
    }
    Ok(Backup {
        path,
        created_at: created,
        patches: out,
    })
}

fn factory_presets() -> Result<Vec<(String, String, Vec<u8>)>, String> {
    let source = include_str!("../assets/factory-presets.ts");
    let marker = "const FACTORY_PRESET_DATA_BASE64 = \"";
    let start = source
        .find(marker)
        .ok_or("Factory preset asset is malformed.")?
        + marker.len();
    let end = source[start..]
        .find('"')
        .ok_or("Factory preset asset is malformed.")?
        + start;
    let raw = base64::engine::general_purpose::STANDARD
        .decode(&source[start..end])
        .map_err(|e| e.to_string())?;
    if raw.len() != 36 * PATCH_SIZE {
        return Err("Factory preset asset has the wrong length.".into());
    }
    Ok((0..36)
        .map(|i| {
            let data = raw[i * PATCH_SIZE..(i + 1) * PATCH_SIZE].to_vec();
            let label = format!("P{}-{}", i / 4 + 1, i % 4 + 1);
            (label, patch::name(&data), data)
        })
        .collect())
}

fn local_library_dirs(data_dir: &Path) -> Result<(PathBuf, PathBuf), String> {
    let root = data_dir.join("library");
    let patches = root.join("patches");
    let sets = root.join("live-sets");
    fs::create_dir_all(&patches).map_err(|e| e.to_string())?;
    fs::create_dir_all(&sets).map_err(|e| e.to_string())?;
    Ok((patches, sets))
}

fn valid_local_id(value: &str) -> Result<&str, String> {
    if !value.is_empty()
        && value.len() <= 80
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
    {
        Ok(value)
    } else {
        Err("Local library ID is invalid.".into())
    }
}

fn local_path(data_dir: &Path, kind: &str, id: &str) -> Result<PathBuf, String> {
    let id = valid_local_id(id)?;
    let (patches, sets) = local_library_dirs(data_dir)?;
    match kind {
        "patch" => Ok(patches.join(format!("{id}.me80.json"))),
        "liveSet" => Ok(sets.join(format!("{id}.tsl"))),
        _ => Err("Local library kind must be patch or liveSet.".into()),
    }
}

fn write_json_safely(path: &Path, value: &Value) -> Result<(), String> {
    let parent = path.parent().ok_or("Local library path has no parent.")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temp = parent.join(format!(".{}.{}.tmp", path.file_name().unwrap().to_string_lossy(), Uuid::new_v4()));
    fs::write(&temp, format!("{}\n", serde_json::to_string_pretty(value).unwrap()))
        .map_err(|e| e.to_string())?;
    let backup = path.with_extension("replace-backup");
    if path.exists() {
        fs::rename(path, &backup).map_err(|e| e.to_string())?;
    }
    if let Err(error) = fs::rename(&temp, path) {
        if backup.exists() {
            let _ = fs::rename(&backup, path);
        }
        let _ = fs::remove_file(&temp);
        return Err(error.to_string());
    }
    if backup.exists() {
        fs::remove_file(backup).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn local_patch_value(id: &str, name: &str, data: &[u8]) -> Value {
    json!({
        "schema":"me80-local-patch-v1",
        "id":id,
        "name":name,
        "device":"ME-80",
        "dataDecimal":data,
        "updatedAt":Utc::now().to_rfc3339()
    })
}

fn read_local_patch(path: &Path) -> Result<(String, String, Vec<u8>), String> {
    let root: Value = serde_json::from_str(&fs::read_to_string(path).map_err(|e| e.to_string())?)
        .map_err(|e| format!("{} is invalid JSON: {e}", path.display()))?;
    if root.get("schema") != Some(&json!("me80-local-patch-v1"))
        || root.get("device") != Some(&json!("ME-80"))
    {
        return Err(format!("{} is not a local ME-80 patch.", path.display()));
    }
    let id = valid_local_id(root.get("id").and_then(Value::as_str).ok_or("Local patch ID is missing.")?)?.to_string();
    let name = root.get("name").and_then(Value::as_str).ok_or("Local patch name is missing.")?.to_string();
    let data = bytes(root.get("dataDecimal").ok_or("Local patch data is missing.")?, "dataDecimal")?;
    patch::validate(&data)?;
    Ok((id, name, data))
}

fn read_live_set(path: &Path) -> Result<Value, String> {
    let root: Value = serde_json::from_str(&fs::read_to_string(path).map_err(|e| e.to_string())?)
        .map_err(|e| format!("{} is not valid TSL JSON: {e}", path.display()))?;
    if root.get("device") != Some(&json!("ME-80")) || root.get("version") != Some(&json!("1.0.0")) {
        return Err(format!("{} is not an ME-80 TSL 1.0.0 file.", path.display()));
    }
    root.pointer("/liveSetData/name").and_then(Value::as_str).ok_or("Live Set name is missing.")?;
    root.get("patchList").and_then(Value::as_array).ok_or("Live Set patchList is missing.")?;
    Ok(root)
}

fn local_library(data_dir: &Path) -> Result<Value, String> {
    let (patch_dir, set_dir) = local_library_dirs(data_dir)?;
    let mut patches = Vec::new();
    let mut live_sets = Vec::new();
    let mut warnings = Vec::new();
    for entry in fs::read_dir(patch_dir).map_err(|e| e.to_string())?.filter_map(Result::ok) {
        let path = entry.path();
        if path.extension().and_then(|x| x.to_str()) != Some("json") { continue; }
        match read_local_patch(&path) {
            Ok((id, name, _)) => patches.push(json!({"id":id,"name":name})),
            Err(error) => warnings.push(error),
        }
    }
    for entry in fs::read_dir(set_dir).map_err(|e| e.to_string())?.filter_map(Result::ok) {
        let path = entry.path();
        if path.extension().and_then(|x| x.to_str()) != Some("tsl") { continue; }
        let id = path.file_stem().and_then(|x| x.to_str()).unwrap_or_default();
        if valid_local_id(id).is_err() { warnings.push(format!("Ignored unsafe filename {}.", path.display())); continue; }
        match read_live_set(&path) {
            Ok(root) => {
                let name = root.pointer("/liveSetData/name").and_then(Value::as_str).unwrap();
                let mut items = Vec::new();
                for (index, item) in root.get("patchList").and_then(Value::as_array).unwrap().iter().enumerate() {
                    let parsed = item
                        .get("params")
                        .and_then(Value::as_object)
                        .ok_or_else(|| "Patch params are missing.".to_string())
                        .and_then(patch::from_tsl_params);
                    match parsed {
                        Ok(data) => items.push(json!({"index":index,"name":patch::name(&data)})),
                        Err(error) => warnings.push(format!("{} patch {}: {error}", path.display(), index + 1)),
                    }
                }
                live_sets.push(json!({"id":id,"name":name,"patches":items}));
            }
            Err(error) => warnings.push(error),
        }
    }
    patches.sort_by_key(|v| v.get("name").and_then(Value::as_str).unwrap_or_default().to_ascii_lowercase());
    live_sets.sort_by_key(|v| v.get("name").and_then(Value::as_str).unwrap_or_default().to_ascii_lowercase());
    Ok(json!({"patches":patches,"liveSets":live_sets,"warnings":warnings,"path":data_dir.join("library")}))
}

fn parse_tsl(source: &str) -> Result<(String, Vec<String>, Vec<Vec<u8>>), String> {
    if source.len() > 5 * 1024 * 1024 {
        return Err("TSL file is too large.".into());
    }
    let root: Value =
        serde_json::from_str(source).map_err(|e| format!("TSL is not valid JSON: {e}"))?;
    if root.get("device") != Some(&json!("ME-80")) {
        return Err("TSL device must be ME-80.".into());
    }
    if root.get("version") != Some(&json!("1.0.0")) {
        return Err("Only ME-80 TSL version 1.0.0 is supported.".into());
    }
    let mut warnings = Vec::new();
    let live = root
        .pointer("/liveSetData/name")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| {
            warnings.push("liveSetData.name is missing; using 'Unnamed liveset'.".into());
            "Unnamed liveset".into()
        });
    let list = root
        .get("patchList")
        .and_then(Value::as_array)
        .ok_or("TSL patchList must be an array.")?;
    if list.is_empty() || list.len() > 1000 {
        return Err("TSL patchList must contain 1-1000 patches.".into());
    }
    let mut patches = Vec::new();
    for (i, item) in list.iter().enumerate() {
        let params = item
            .get("params")
            .and_then(Value::as_object)
            .ok_or_else(|| format!("TSL patch {} params must be an object.", i + 1))?;
        let data = patch::from_tsl_params(params)?;
        patch::validate(&data)?;
        if !data[..16].iter().all(|b| (0x20..=0x7e).contains(b)) {
            return Err(format!("TSL patch {} name must be printable ASCII.", i + 1));
        }
        let padded = patch::padded_name(&data);
        if let Some(name) = item.get("name").and_then(Value::as_str) {
            if name != padded {
                return Err(format!(
                    "TSL patch {} name metadata does not match its 16 name bytes.",
                    i + 1
                ));
            }
        }
        if let Some(name) = params.get("patchname").and_then(Value::as_str) {
            if name != padded {
                return Err(format!(
                    "TSL patch {} params.patchname does not match its 16 name bytes.",
                    i + 1
                ));
            }
        }
        for (offset, max) in [
            (0x10, 1),
            (0x11, 1),
            (0x12, 1),
            (0x13, 1),
            (0x14, 1),
            (0x15, 1),
            (0x16, 1),
            (0x17, 1),
            (0x18, 10),
            (0x19, 10),
            (0x1a, 10),
            (0x1b, 10),
            (0x1c, 8),
            (0x1d, 5),
            (0x1e, 9),
            (0x1f, 2),
        ] {
            if data[offset] > max {
                return Err(format!(
                    "TSL patch {} has an out-of-range effect value.",
                    i + 1
                ));
            }
        }
        if data[0x20..=0x34].iter().any(|b| *b > 99)
            || data[0x35] > 15
            || data[0x36] > 15
            || data[0x37] > 100
            || data[0x38] > 1
            || data[0x39] > 50
            || data[0x3a] > 49
        {
            return Err(format!(
                "TSL patch {} contains an unsafe parameter value.",
                i + 1
            ));
        }
        patches.push(data)
    }
    Ok((live, warnings, patches))
}

fn changes(body: &Value) -> Result<Vec<(String, u8)>, String> {
    let parse = |v: &Value| -> Result<(String, u8), String> {
        let field = v
            .get("field")
            .and_then(Value::as_str)
            .ok_or("field must be a string.")?
            .to_string();
        let value = v
            .get("value")
            .and_then(Value::as_u64)
            .filter(|n| *n <= 255)
            .ok_or("value must be a byte.")? as u8;
        Ok((field, value))
    };
    if let Some(items) = body.get("changes") {
        let list = items.as_array().ok_or("changes must be an array.")?;
        if !(2..=4).contains(&list.len()) {
            return Err("A grouped edit must contain between two and four fields.".into());
        }
        let out = list.iter().map(parse).collect::<Result<Vec<_>, _>>()?;
        let fields = out
            .iter()
            .map(|x| x.0.as_str())
            .collect::<std::collections::HashSet<_>>();
        let reverb = fields.len() == 2 && fields.contains("rev_type") && fields.contains("rev");
        let ctl = fields.iter().all(|field| {
            matches!(
                *field,
                "ctl_target_h" | "ctl_target_l" | "ctrl_knob_value" | "ctl_mode"
            )
        });
        if !reverb && !ctl {
            return Err("Grouped edits are limited to reverb or CTL assignment fields.".into());
        }
        Ok(out)
    } else if body.get("field").is_some() {
        Ok(vec![parse(body)?])
    } else {
        Ok(Vec::new())
    }
}

fn read_patch(
    midi: &mut Session,
    address: [u8; 4],
    request: Vec<u8>,
) -> Result<(Vec<u8>, Vec<MidiLog>), String> {
    midi.begin_operation();
    let response = midi.request(&request, address)?;
    Ok((response.data, midi.take_logs()))
}

fn read_device_library(
    midi: &mut Session,
) -> Result<(Vec<(String, String)>, HashMap<String, Vec<u8>>, Vec<MidiLog>), String> {
    midi.begin_operation();
    let mut entries = Vec::with_capacity(72);
    let mut patches = HashMap::with_capacity(72);
    for prefix in ['U', 'P'] {
        for bank in 1..=9 {
            for number in 1..=4 {
                let label = format!("{prefix}{bank}-{number}");
                let slot = sysex::slot(&label)?;
                let response = midi.request(&sysex::stored_rq1(&label)?, slot.address)?;
                patch::validate(&response.data)?;
                entries.push((label.clone(), patch::name(&response.data)));
                patches.insert(label, response.data);
            }
        }
    }
    Ok((entries, patches, midi.take_logs()))
}

fn live_session(state: &mut AppState, input: usize, output: usize) -> Result<&mut Session, String> {
    let replace = state
        .live_midi
        .as_ref()
        .map(|live| live.input != input || live.output != output)
        .unwrap_or(true);
    if replace {
        // A MIDI endpoint can only have one owner. Release a stale live session
        // before opening its replacement rather than briefly opening both.
        state.live_midi = None;
        let mut session = Session::open(input, output)?;
        session.enable_editor_mode()?;
        state.live_midi = Some(LiveMidi {
            input,
            output,
            session,
            event_checks: 0,
        });
    }
    Ok(&mut state.live_midi.as_mut().unwrap().session)
}

fn live_operation<T>(
    state: &mut AppState,
    input: usize,
    output: usize,
    operation: impl FnOnce(&mut Session) -> Result<T, String>,
) -> Result<T, String> {
    let midi = live_session(state, input, output)?;
    let result = operation(midi);
    if result.is_err() {
        // A timed-out Windows MIDI connection can continue delivering pedal
        // events while never delivering an RQ1 response again. Release it so the
        // next poll recreates the connection, just as an application restart does.
        // Session cleanup intentionally does not send editor-mode-off.
        state.live_midi = None;
    }
    result
}

fn device_operation<T>(
    state: &mut AppState,
    input: usize,
    output: usize,
    operation: impl FnOnce(&mut Session) -> Result<T, String>,
) -> Result<T, String> {
    // A standalone command can race with a queued UI stop. If the live connection
    // is still present, reuse it instead of ever opening the same endpoint twice.
    let reuse_live = state
        .live_midi
        .as_ref()
        .is_some_and(|live| live.input == input && live.output == output);
    if reuse_live {
        let result = operation(&mut state.live_midi.as_mut().unwrap().session);
        if result.is_ok() {
            let live = state.live_midi.as_mut().unwrap();
            live.event_checks = 0;
        }
        return result;
    }
    if state.live_midi.is_some() {
        state.live_midi = None;
    }
    let mut midi = Session::open(input, output)?;
    operation(&mut midi)
}

fn live_events(
    state: &mut AppState,
    input: usize,
    output: usize,
) -> Result<(Vec<sysex::Dt1>, Option<Vec<u8>>, Vec<MidiLog>), String> {
    let result = {
        let live = state
            .live_midi
            .as_mut()
            .filter(|live| live.input == input && live.output == output);
        if live.is_none() {
            let _ = live_session(state, input, output)?;
        }
        let live = state.live_midi.as_mut().unwrap();
        let events = live.session.drain_dt1()?;
        live.event_checks += 1;
        let recovery = if live.event_checks >= 40 {
            live.event_checks = 0;
            live.session.begin_operation();
            Some(
                live.session
                    .request(&sysex::temp_rq1(), [0x20, 0, 0, 0])?
                    .data,
            )
        } else {
            None
        };
        Ok((events, recovery, live.session.take_logs()))
    };
    if result.is_err() {
        // Recovery reads use the same long-lived connection as event polling.
        // Once that connection times out, keeping it makes every later recovery
        // read fail until the application is restarted.
        state.live_midi = None;
    }
    result
}
fn load_temporary_patch(midi: &mut Session, data: &[u8]) -> Result<Vec<MidiLog>, String> {
    midi.begin_operation();
    midi.send(&sysex::dt1([0x20, 0, 0, 0], data)?)?;
    thread::sleep(Duration::from_millis(500));
    let got = midi.request(&sysex::temp_rq1(), [0x20, 0, 0, 0])?;
    if !same(&got.data, data) {
        return Err("Temporary readback did not match all 71 requested bytes.".into());
    }
    Ok(midi.take_logs())
}

fn live_edit(midi: &mut Session, data: &[u8], fields: &[String]) -> Result<Vec<MidiLog>, String> {
    if fields.is_empty() || fields.len() > 4 {
        return Err("Live editing requires between one and four verified fields.".into());
    }
    midi.begin_operation();
    let ctl_edit = fields.iter().any(|field| {
        matches!(
            field.as_str(),
            "ctl_target_h" | "ctl_target_l" | "ctrl_knob_value" | "ctl_mode"
        )
    });
    if ctl_edit {
        // The ME-80 treats the CTL assignment as one four-byte structure. Sending
        // its members separately exposes transient, invalid assignments that the
        // unit may reject or normalize before the remaining bytes arrive.
        midi.send(&sysex::dt1([0x20, 0, 0, 0x35], &data[0x35..0x39])?)?;
    }
    let ordinary_fields = fields
        .iter()
        .filter(|field| {
            !matches!(
                field.as_str(),
                "ctl_target_h" | "ctl_target_l" | "ctrl_knob_value" | "ctl_mode"
            )
        })
        .collect::<Vec<_>>();
    let ordinary_count = ordinary_fields.len();
    for (i, field) in ordinary_fields.into_iter().enumerate() {
        let offset = patch::FIELDS
            .iter()
            .position(|f| f == field)
            .filter(|o| *o >= 16)
            .ok_or_else(|| format!("Field {field} is not eligible for live editing."))?;
        let (address, value) = ([0x20, 0, 0, offset as u8], vec![data[offset]]);
        midi.send(&sysex::dt1(address, &value)?)?;
        if i + 1 < ordinary_count {
            thread::sleep(Duration::from_millis(75))
        }
    }
    thread::sleep(Duration::from_millis(100));
    let got = midi.request(&sysex::temp_rq1(), [0x20, 0, 0, 0])?;
    if !same(&got.data, data) {
        return Err("Live-edit readback did not match the complete 71-byte patch.".into());
    }
    Ok(midi.take_logs())
}

fn recovery_path(
    data_dir: &Path,
    label: &str,
    request: &[u8],
    response: &sysex::Dt1,
    raw: &[u8],
) -> Result<String, String> {
    let dir = data_dir.join("backups").join("pre-write");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = Utc::now().format("%Y%m%d-%H%M%SZ");
    let path = dir.join(format!("{}-{stamp}.json", label.to_ascii_lowercase()));
    let evidence = json!({"schema":"me80-pre-write-recovery-v1","device":"ME-80","createdAt":Utc::now().to_rfc3339(),"slot":label,"addressHex":response.address.iter().map(|b|format!("{b:02X}")).collect::<Vec<_>>().join(" "),"name":patch::padded_name(&response.data),"dataHex":response.data.iter().map(|b|format!("{b:02X}")).collect::<Vec<_>>().join(" "),"dataDecimal":response.data,"requestHex":request.iter().map(|b|format!("{b:02X}")).collect::<Vec<_>>().join(" "),"responseHex":raw.iter().map(|b|format!("{b:02X}")).collect::<Vec<_>>().join(" "),"responseDecimal":raw,"receivedChecksumHex":format!("{:02X}",response.received_checksum)});
    fs::write(
        &path,
        format!("{}\n", serde_json::to_string_pretty(&evidence).unwrap()),
    )
    .map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

fn store_patch(
    midi: &mut Session,
    data_dir: &Path,
    slot: &sysex::Slot,
    data: &[u8],
) -> Result<(Vec<MidiLog>, String), String> {
    midi.begin_operation();
    let request = sysex::stored_rq1(&slot.label)?;
    let original = midi.request(&request, slot.address)?;
    let raw = {
        let mut bytes = vec![0xf0, 0x41, original.device_id, 0, 0, 0, 1, 0x12];
        bytes.extend(original.address);
        bytes.extend(&original.data);
        bytes.push(original.received_checksum);
        bytes.push(0xf7);
        bytes
    };
    let recovery = recovery_path(data_dir, &slot.label, &request, &original, &raw)?;
    midi.send(&sysex::dt1(slot.address, data)?)?;
    thread::sleep(Duration::from_millis(500));
    let verified = midi.request(&request, slot.address)?;
    if !same(&verified.data, data) {
        return Err("Stored readback did not match all 71 requested bytes.".into());
    }
    Ok((midi.take_logs(), recovery))
}

fn cache_stored_patch(
    device_library: &mut HashMap<String, Vec<u8>>,
    slot: &sysex::Slot,
    data: &[u8],
) -> String {
    device_library.insert(slot.label.clone(), data.to_vec());
    patch::name(data)
}

fn patch_for_store(patch: &Patch, body: &Value) -> Result<Patch, String> {
    let name = match body.get("name") {
        None => None,
        Some(Value::String(name)) => Some(name.trim_end()),
        Some(_) => return Err("name must be a string.".into()),
    };
    patch::edit(patch, &[], name)
}

fn preserve_staged_name(patch: &Patch, data: &mut [u8]) {
    // Patch names are permanent-slot metadata: the ME-80 rejects attempts to
    // edit them in temporary memory. Keep a local rename from being undone by
    // the periodic live recovery read until Store writes it to a user slot.
    if patch.original[..16] != patch.data[..16] {
        data[..16].copy_from_slice(&patch.data[..16]);
    }
}

fn route(state: &mut AppState, path: &str, method: &str, body: &Value) -> Result<Value, String> {
    if method == "GET" && path == "/api/status" {
        let (inputs, outputs) = midi::ports()?;
        let suggested_input = inputs.iter().find(|p| p.normal).map(|p| p.index);
        let suggested_output = outputs.iter().find(|p| p.normal).map(|p| p.index);
        return Ok(
            json!({"busy":state.busy,"inputs":inputs,"outputs":outputs,"suggestedInput":suggested_input,"suggestedOutput":suggested_output,"effectTypes":patch::effect_types()}),
        );
    }
    if method == "GET" && path == "/api/library/backup" {
        let backup = latest_backup(&state.data_dir).and_then(load_backup).ok();
        let mut entries = backup
            .as_ref()
            .map(|backup| {
                backup
                    .patches
                    .iter()
                    .map(|(slot, name, _, decoded)| {
                        json!({"slot":slot,"name":name,"decoded":decoded})
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        entries.extend(
            factory_presets()?
                .into_iter()
                .map(|(slot, name, _)| json!({"slot":slot,"name":name})),
        );
        return Ok(match backup {
            Some(backup) => json!({"path":backup.path,"createdAt":backup.created_at,"backupAvailable":true,"patches":entries}),
            None => json!({"createdAt":null,"backupAvailable":false,"patches":entries}),
        });
    }
    if method == "POST" && path == "/api/library/device" {
        let (input, output) = (index(body, "inputIndex")?, index(body, "outputIndex")?);
        let (entries, patches, logs) =
            device_operation(state, input, output, read_device_library)?;
        state.device_library = patches;
        return Ok(json!({
            "patches": entries.into_iter().map(|(slot, name)| json!({"slot":slot,"name":name})).collect::<Vec<_>>(),
            "logs": logs
        }));
    }
    if method == "POST" && path == "/api/library/load-device" {
        let slot = sysex::slot(string(body, "slot")?)?;
        let data = state
            .device_library
            .get(&slot.label)
            .cloned()
            .ok_or_else(|| format!("{} is not in the current hardware scan. Refresh the patch library.", slot.label))?;
        return Ok(json!({"patch":add_session(state,format!("ME-80 {}",slot.label),data)?}));
    }
    if method == "POST" && path == "/api/library/load-backup" {
        let slot = sysex::slot(string(body, "slot")?)?;
        if !slot.user {
            let source = factory_presets()?
                .into_iter()
                .find(|x| x.0 == slot.label)
                .ok_or("Factory preset not found.")?;
            return Ok(
                json!({"patch":add_session(state,format!("Factory {}",slot.label),source.2)?}),
            );
        }
        let backup = load_backup(latest_backup(&state.data_dir)?)?;
        let source = backup
            .patches
            .into_iter()
            .find(|x| x.0 == slot.label)
            .ok_or_else(|| format!("Latest backup does not contain {}.", slot.label))?;
        return Ok(json!({"patch":add_session(state,format!("Backup {}",slot.label),source.2)?}));
    }
    if method == "GET" && path == "/api/local/list" {
        return local_library(&state.data_dir);
    }
    if method == "POST" && path == "/api/local/save-patch" {
        let session_id = string(body, "sessionId")?;
        let data = state.sessions.get(session_id).ok_or("Patch session was not found.")?.patch.data.clone();
        let id = body.get("id").and_then(Value::as_str).map(valid_local_id).transpose()?.map(str::to_string).unwrap_or_else(|| Uuid::new_v4().to_string());
        let name = body
            .get("name")
            .and_then(Value::as_str)
            .filter(|x| !x.trim().is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| patch::name(&data));
        let path = local_path(&state.data_dir, "patch", &id)?;
        write_json_safely(&path, &local_patch_value(&id, &name, &data))?;
        return Ok(json!({"ok":true,"id":id,"path":path}));
    }
    if method == "POST" && path == "/api/local/import-tsl" {
        let source = string(body, "source")?;
        let (name, warnings, _) = parse_tsl(source)?;
        let mut root: Value = serde_json::from_str(source).map_err(|e| e.to_string())?;
        let id = Uuid::new_v4().to_string();
        root.as_object_mut().unwrap().insert("me80PatchEditorId".into(), json!(id));
        let path = local_path(&state.data_dir, "liveSet", &id)?;
        write_json_safely(&path, &root)?;
        return Ok(json!({"ok":true,"id":id,"name":name,"warnings":warnings,"path":path}));
    }
    if method == "POST" && path == "/api/local/create-set" {
        let name = string(body, "name")?.trim();
        let id = Uuid::new_v4().to_string();
        let root = json!({"device":"ME-80","version":"1.0.0","liveSetData":{"name":name},"patchList":[],"me80PatchEditorId":id});
        let path = local_path(&state.data_dir, "liveSet", &id)?;
        write_json_safely(&path, &root)?;
        return Ok(json!({"ok":true,"id":id,"path":path}));
    }
    if method == "POST" && path == "/api/local/load" {
        let kind = string(body, "kind")?;
        let id = string(body, "id")?;
        let (label, data) = if kind == "patch" {
            let (_, name, data) = read_local_patch(&local_path(&state.data_dir, kind, id)?)?;
            (format!("Local patch · {name}"), data)
        } else {
            let root = read_live_set(&local_path(&state.data_dir, kind, id)?)?;
            let item_index = index(body, "index")?;
            let item = root.get("patchList").and_then(Value::as_array).and_then(|x| x.get(item_index)).ok_or("Live Set patch index is invalid.")?;
            let data = patch::from_tsl_params(item.get("params").and_then(Value::as_object).ok_or("Live Set patch params are missing.")?)?;
            let set_name = root.pointer("/liveSetData/name").and_then(Value::as_str).unwrap();
            (format!("{set_name} · {}", item_index + 1), data)
        };
        return Ok(json!({"patch":add_session(state,label,data)?}));
    }
    if method == "POST" && path == "/api/local/add-to-set" {
        let set_id = string(body, "setId")?;
        let session_id = string(body, "sessionId")?;
        let data = state.sessions.get(session_id).ok_or("Patch session was not found.")?.patch.data.clone();
        let path = local_path(&state.data_dir, "liveSet", set_id)?;
        let mut root = read_live_set(&path)?;
        root.get_mut("patchList").and_then(Value::as_array_mut).unwrap().push(json!({"params":patch::to_tsl_params(&data)?}));
        write_json_safely(&path, &root)?;
        return Ok(json!({"ok":true}));
    }
    if method == "POST" && path == "/api/local/save-live-patch" {
        let set_id = string(body, "setId")?;
        let item_index = index(body, "index")?;
        let session_id = string(body, "sessionId")?;
        let data = state.sessions.get(session_id).ok_or("Patch session was not found.")?.patch.data.clone();
        let path = local_path(&state.data_dir, "liveSet", set_id)?;
        let mut root = read_live_set(&path)?;
        let item = root.get_mut("patchList").and_then(Value::as_array_mut).and_then(|x| x.get_mut(item_index)).ok_or("Live Set patch index is invalid.")?;
        item.as_object_mut().ok_or("Live Set patch entry is invalid.")?.insert("params".into(), json!(patch::to_tsl_params(&data)?));
        write_json_safely(&path, &root)?;
        return Ok(json!({"ok":true}));
    }
    if method == "POST" && path == "/api/local/rename" {
        let kind = string(body, "kind")?;
        let id = string(body, "id")?;
        let name = string(body, "name")?.trim();
        let path = local_path(&state.data_dir, kind, id)?;
        if kind == "patch" {
            let (_, _, data) = read_local_patch(&path)?;
            let p = Patch { original:data.clone(), data };
            let renamed = patch::edit(&p, &[], Some(name))?;
            write_json_safely(&path, &local_patch_value(id, name, &renamed.data))?;
        } else {
            let mut root = read_live_set(&path)?;
            root.pointer_mut("/liveSetData/name").ok_or("Live Set name is missing.")?.clone_from(&json!(name));
            write_json_safely(&path, &root)?;
        }
        return Ok(json!({"ok":true}));
    }
    if method == "POST" && path == "/api/local/remove-live-patch" {
        let id = string(body, "id")?;
        let item_index = index(body, "index")?;
        let path = local_path(&state.data_dir, "liveSet", id)?;
        let mut root = read_live_set(&path)?;
        let list = root.get_mut("patchList").and_then(Value::as_array_mut).unwrap();
        if item_index >= list.len() { return Err("Live Set patch index is invalid.".into()); }
        list.remove(item_index);
        write_json_safely(&path, &root)?;
        return Ok(json!({"ok":true}));
    }
    if method == "POST" && path == "/api/local/move-live-patch" {
        let id = string(body, "id")?;
        let from = index(body, "from")?;
        let to = index(body, "to")?;
        let path = local_path(&state.data_dir, "liveSet", id)?;
        let mut root = read_live_set(&path)?;
        let list = root.get_mut("patchList").and_then(Value::as_array_mut).unwrap();
        if from >= list.len() || to >= list.len() { return Err("Live Set patch index is invalid.".into()); }
        let item = list.remove(from);
        list.insert(to, item);
        write_json_safely(&path, &root)?;
        return Ok(json!({"ok":true}));
    }
    if method == "POST" && path == "/api/local/delete" {
        let path = local_path(&state.data_dir, string(body, "kind")?, string(body, "id")?)?;
        fs::remove_file(&path).map_err(|e| format!("Could not delete {}: {e}", path.display()))?;
        return Ok(json!({"ok":true}));
    }
    if method == "POST" && path == "/api/local/duplicate" {
        let kind = string(body, "kind")?;
        let source_id = string(body, "id")?;
        let id = Uuid::new_v4().to_string();
        if kind == "patch" {
            let (_, old_name, data) = read_local_patch(&local_path(&state.data_dir, kind, source_id)?)?;
            let name = format!("{} COPY", old_name).chars().take(16).collect::<String>();
            write_json_safely(&local_path(&state.data_dir, kind, &id)?, &local_patch_value(&id, &name, &data))?;
        } else {
            let mut root = read_live_set(&local_path(&state.data_dir, kind, source_id)?)?;
            let old_name = root.pointer("/liveSetData/name").and_then(Value::as_str).unwrap();
            let name = format!("{old_name} Copy");
            root.pointer_mut("/liveSetData/name").unwrap().clone_from(&json!(name));
            root.as_object_mut().unwrap().insert("me80PatchEditorId".into(), json!(id));
            write_json_safely(&local_path(&state.data_dir, kind, &id)?, &root)?;
        }
        return Ok(json!({"ok":true,"id":id}));
    }
    if method == "POST" && path == "/api/library/import-tsl" {
        let source = string(body, "source")?;
        let (live, warnings, items) = parse_tsl(source)?;
        let mut views = Vec::new();
        for (i, data) in items.into_iter().enumerate() {
            views.push(add_session(state, format!("{live} · {}", i + 1), data)?)
        }
        return Ok(json!({"liveSetName":live,"warnings":warnings,"patches":views}));
    }
    if method == "POST" && path == "/api/device/live-stop" {
        state.live_midi = None;
        return Ok(json!({"ok":true}));
    }
    if method == "POST" && path == "/api/device/read-current" {
        let (input, output) = (index(body, "inputIndex")?, index(body, "outputIndex")?);
        let (data, logs) = device_operation(state, input, output, |midi| {
            read_patch(midi, [0x20, 0, 0, 0], sysex::temp_rq1())
        })?;
        let view = add_session(state, "Live temporary patch".into(), data)?;
        return Ok(json!({"patch":view,"logs":logs}));
    }
    if let Some(id) = path
        .strip_prefix("/api/session/")
        .and_then(|p| p.strip_suffix("/edit"))
    {
        if method == "POST" {
            let edits = changes(body)?;
            let new_name = body.get("name").and_then(Value::as_str);
            if new_name.is_some() && !edits.is_empty() {
                return Err("A name and parameter fields cannot be edited together.".into());
            }
            let s = state
                .sessions
                .get_mut(id)
                .ok_or("Patch session was not found. Reload the patch and try again.")?;
            s.patch = patch::edit(&s.patch, &edits, new_name)?;
            return Ok(json!({"patch":session_view(id,s)?}));
        }
    }
    if method == "POST" && path == "/api/device/live-edit" {
        if body.get("confirm") != Some(&json!("LIVE_SYNC")) {
            return Err("Live Sync confirmation is missing.".into());
        }
        let (input, output, id) = (
            index(body, "inputIndex")?,
            index(body, "outputIndex")?,
            string(body, "sessionId")?.to_string(),
        );
        let edits = changes(body)?;
        let new_name = body.get("name").and_then(Value::as_str);
        let s = state
            .sessions
            .get(&id)
            .ok_or("Patch session was not found. Reload the patch and try again.")?;
        let candidate = patch::edit(&s.patch, &edits, new_name)?;
        let fields = if new_name.is_some() {
            vec!["name".into()]
        } else {
            edits.iter().map(|x| x.0.clone()).collect()
        };
        let logs = if new_name.is_some() {
            // Names cannot be changed in ME-80 temporary memory. Stage the
            // candidate locally; Store will include it in the verified write.
            Vec::new()
        } else {
            live_operation(state, input, output, |midi| {
                live_edit(midi, &candidate.data, &fields)
            })?
        };
        let s = state.sessions.get_mut(&id).unwrap();
        s.patch = candidate;
        return Ok(json!({"patch":session_view(&id,s)?,"logs":logs}));
    }
    if method == "POST" && path == "/api/device/live-poll" {
        if body.get("confirm") != Some(&json!("LIVE_SYNC")) {
            return Err("Live Sync confirmation is missing.".into());
        }
        let (input, output, id) = (
            index(body, "inputIndex")?,
            index(body, "outputIndex")?,
            string(body, "sessionId")?.to_string(),
        );
        let (events, recovery, logs) = live_events(state, input, output)?;
        let s = state
            .sessions
            .get_mut(&id)
            .ok_or("Patch session was not found. Reload the patch and try again.")?;
        let mut data = s.patch.data.clone();
        for event in events {
            if event.address[0..3] != [0x20, 0, 0] {
                continue;
            }
            let offset = event.address[3] as usize;
            if offset < PATCH_SIZE && offset + event.data.len() <= PATCH_SIZE {
                data[offset..offset + event.data.len()].copy_from_slice(&event.data);
            }
        }
        if let Some(full) = recovery {
            data = full;
        }
        preserve_staged_name(&s.patch, &mut data);
        let changed = s.patch.data != data;
        if changed {
            s.patch.data = data;
            s.source_label = "Live temporary patch".into()
        }
        return Ok(json!({"patch":session_view(&id,s)?,"changed":changed,"logs":logs}));
    }
    if method == "POST" && path == "/api/device/live-load" {
        if body.get("confirm") != Some(&json!("LIVE_SYNC")) {
            return Err("Live Sync confirmation is missing.".into());
        }
        let (input, output, id) = (
            index(body, "inputIndex")?,
            index(body, "outputIndex")?,
            string(body, "sessionId")?,
        );
        let data = state
            .sessions
            .get(id)
            .ok_or("Patch session was not found. Reload the patch and try again.")?
            .patch
            .data
            .clone();
        // Reuse the editor-mode session so a patch choice cannot cycle editor mode
        // off and on while the pedal is processing the temporary-patch write.
        let logs = live_operation(state, input, output, |midi| {
            load_temporary_patch(midi, &data)
        })?;
        if let Some(live) = state.live_midi.as_mut() {
            live.event_checks = 0;
        }
        return Ok(json!({"ok":true,"logs":logs}));
    }
    if method == "POST" && path == "/api/device/audition" {
        if body.get("confirm") != Some(&json!("AUDITION")) {
            return Err("Temporary audition confirmation is missing.".into());
        }
        let (input, output, id) = (
            index(body, "inputIndex")?,
            index(body, "outputIndex")?,
            string(body, "sessionId")?,
        );
        let data = state
            .sessions
            .get(id)
            .ok_or("Patch session was not found. Reload the patch and try again.")?
            .patch
            .data
            .clone();
        let logs = device_operation(state, input, output, |midi| {
            load_temporary_patch(midi, &data)
        })?;
        return Ok(json!({"ok":true,"logs":logs}));
    }
    if method == "POST" && path == "/api/device/live-store" {
        if body.get("syncConfirm") != Some(&json!("LIVE_SYNC")) {
            return Err("Live Sync confirmation is missing.".into());
        }
        let slot = sysex::slot(string(body, "slot")?)?;
        if !slot.user {
            return Err("Writes are restricted to user slots U1-1 through U9-4.".into());
        }
        if body.get("confirm").and_then(Value::as_str) != Some(slot.label.as_str()) {
            return Err(format!(
                "Type {} exactly to confirm this overwrite.",
                slot.label
            ));
        }
        let (input, output, id) = (
            index(body, "inputIndex")?,
            index(body, "outputIndex")?,
            string(body, "sessionId")?,
        );
        let current = state
            .sessions
            .get(id)
            .ok_or("Patch session was not found. Reload the patch and try again.")?
            .patch
            .clone();
        // The title input commits on blur. Include its current value in this
        // transaction so a Store click can never race that separate edit request.
        let candidate = patch_for_store(&current, body)?;
        let data = candidate.data.clone();
        let data_dir = state.data_dir.clone();
        // Store through the same editor-mode connection used by Live Sync. Closing
        // it before the write is the same mode transition that broke patch loading.
        let (logs, recovery) = live_operation(state, input, output, |midi| {
            store_patch(midi, &data_dir, &slot, &data)
        })?;
        if let Some(live) = state.live_midi.as_mut() {
            live.event_checks = 0;
        }
        let patch_view = {
            let session = state.sessions.get_mut(id).unwrap();
            session.patch = candidate;
            session_view(id, session)?
        };
        let name = cache_stored_patch(&mut state.device_library, &slot, &data);
        return Ok(
            json!({"ok":true,"slot":slot.label,"name":name,"patch":patch_view,"logs":logs,"recoveryPath":recovery}),
        );
    }
    if method == "POST" && path == "/api/device/store" {
        let slot = sysex::slot(string(body, "slot")?)?;
        if !slot.user {
            return Err("Writes are restricted to user slots U1-1 through U9-4.".into());
        }
        if body.get("confirm").and_then(Value::as_str) != Some(slot.label.as_str()) {
            return Err(format!(
                "Type {} exactly to confirm this overwrite.",
                slot.label
            ));
        }
        let (input, output, id) = (
            index(body, "inputIndex")?,
            index(body, "outputIndex")?,
            string(body, "sessionId")?,
        );
        let current = state
            .sessions
            .get(id)
            .ok_or("Patch session was not found. Reload the patch and try again.")?
            .patch
            .clone();
        let candidate = patch_for_store(&current, body)?;
        let data = candidate.data.clone();
        let data_dir = state.data_dir.clone();
        let (logs, recovery) = device_operation(state, input, output, |midi| {
            store_patch(midi, &data_dir, &slot, &data)
        })?;
        let patch_view = {
            let session = state.sessions.get_mut(id).unwrap();
            session.patch = candidate;
            session_view(id, session)?
        };
        let name = cache_stored_patch(&mut state.device_library, &slot, &data);
        return Ok(
            json!({"ok":true,"slot":slot.label,"name":name,"patch":patch_view,"logs":logs,"recoveryPath":recovery}),
        );
    }
    Err("API route not found.".into())
}

#[tauri::command]
async fn api(
    state: State<'_, Arc<Mutex<AppState>>>,
    path: String,
    method: String,
    body: Value,
) -> Result<Value, String> {
    let shared = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let mut locked = shared
            .lock()
            .map_err(|_| "Application state lock was poisoned.".to_string())?;
        route(&mut locked, &path, &method, &body)
    })
    .await
    .map_err(|error| format!("Native operation failed: {error}"))?
}

pub fn run() {
    tauri::Builder::default()
        .manage(Arc::new(Mutex::new(AppState {
            sessions: HashMap::new(),
            device_library: HashMap::new(),
            data_dir: data_directory(),
            busy: false,
            live_midi: None,
        })))
        .invoke_handler(tauri::generate_handler![api])
        .run(tauri::generate_context!())
        .expect("error while running me-80-patch-editor")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn factory_library_is_complete() {
        let p = factory_presets().unwrap();
        assert_eq!(p.len(), 36);
        assert_eq!(p[0].0, "P1-1");
        assert_eq!(p[0].1, "ROCK LEAD");
        assert_eq!(p[35].0, "P9-4");
    }
    #[test]
    fn p1_fixture_maps_to_factory_bytes() {
        let params: Value =
            serde_json::from_str(include_str!("../fixtures/p1-1-byte-params.json")).unwrap();
        let bytes = patch::from_tsl_params(params.as_object().unwrap()).unwrap();
        assert_eq!(bytes, factory_presets().unwrap()[0].2);
        assert_eq!(
            patch::decode(&bytes)
                .unwrap()
                .pointer("/typeNames/comp")
                .unwrap(),
            "Single>Hum"
        );
    }
    #[test]
    fn unsafe_edits_are_rejected() {
        let data = factory_presets().unwrap()[0].2.clone();
        let patch = Patch {
            original: data.clone(),
            data,
        };
        assert!(patch::edit(&patch, &[("amp1".into(), 100)], None).is_err());
        assert!(patch::edit(&patch, &[("value_dummy_1_h".into(), 1)], None).is_err());
    }
    #[test]
    fn verified_ctl_edits_are_allowed() {
        let data = factory_presets().unwrap()[0].2.clone();
        let patch = Patch {
            original: data.clone(),
            data,
        };
        let edited = patch::edit(
            &patch,
            &[
                ("ctrl_knob_value".into(), 37),
                ("ctl_target_h".into(), 1),
                ("ctl_target_l".into(), 1),
                ("ctl_mode".into(), 0),
            ],
            None,
        )
        .unwrap();
        assert_eq!(&edited.data[0x35..=0x38], &[1, 1, 37, 0]);
        assert!(patch::edit(&patch, &[("ctl_target_h".into(), 16)], None).is_err());
    }
    #[test]
    fn tsl_params_round_trip_all_patch_bytes() {
        let data = factory_presets().unwrap()[0].2.clone();
        let params = patch::to_tsl_params(&data).unwrap();
        assert_eq!(patch::from_tsl_params(&params).unwrap(), data);
    }

    #[test]
    fn local_library_round_trip() {
        let root = std::env::temp_dir().join(format!("me80-library-test-{}", Uuid::new_v4()));
        let data = factory_presets().unwrap()[0].2.clone();
        let id = Uuid::new_v4().to_string();
        let patch_path = local_path(&root, "patch", &id).unwrap();
        write_json_safely(&patch_path, &local_patch_value(&id, "ROCK LEAD", &data)).unwrap();
        let listing = local_library(&root).unwrap();
        assert_eq!(listing.pointer("/patches/0/id").and_then(Value::as_str), Some(id.as_str()));
        assert_eq!(read_local_patch(&patch_path).unwrap().2, data);
        fs::remove_dir_all(&root).unwrap();
    }
    #[test]
    fn successful_store_replaces_cached_device_patch() {
        let presets = factory_presets().unwrap();
        let slot = sysex::slot("U9-4").unwrap();
        let mut cache = HashMap::from([(slot.label.clone(), presets[1].2.clone())]);
        let name = cache_stored_patch(&mut cache, &slot, &presets[0].2);
        assert_eq!(name, "ROCK LEAD");
        assert_eq!(cache.get("U9-4"), Some(&presets[0].2));
    }
    #[test]
    fn store_uses_the_name_submitted_with_the_write() {
        let data = factory_presets().unwrap()[0].2.clone();
        let patch = Patch {
            original: data.clone(),
            data,
        };
        let candidate = patch_for_store(&patch, &json!({"name":"paranoid phaser"})).unwrap();
        assert_eq!(patch::name(&candidate.data), "paranoid phaser");
        assert_eq!(patch::name(&patch.data), "ROCK LEAD");
        assert_eq!(candidate.original, patch.original);
    }
    #[test]
    fn live_recovery_does_not_discard_a_staged_name() {
        let data = factory_presets().unwrap()[0].2.clone();
        let original = Patch {
            original: data.clone(),
            data,
        };
        let renamed = patch::edit(&original, &[], Some("Quarter Organ")).unwrap();
        let mut recovery = original.data.clone();
        recovery[0x2c] = 12;
        preserve_staged_name(&renamed, &mut recovery);
        assert_eq!(patch::name(&recovery), "Quarter Organ");
        assert_eq!(recovery[0x2c], 12);
    }
    #[test]
    fn grouped_edits_are_scoped() {
        assert!(changes(&json!({"changes":[
            {"field":"ctrl_knob_value","value":100},
            {"field":"ctl_target_h","value":3},
            {"field":"ctl_target_l","value":7}
        ]}))
        .is_ok());
        assert!(changes(&json!({"changes":[
            {"field":"ctl_target_h","value":3},
            {"field":"amp1","value":20}
        ]}))
        .is_err());
    }
}

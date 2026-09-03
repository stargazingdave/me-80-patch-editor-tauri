use serde_json::{json, Map, Value};

pub const PATCH_SIZE: usize = 0x47;

pub const FIELDS: [&str; PATCH_SIZE] = [
    "name1",
    "name2",
    "name3",
    "name4",
    "name5",
    "name6",
    "name7",
    "name8",
    "name9",
    "name10",
    "name11",
    "name12",
    "name13",
    "name14",
    "name15",
    "name16",
    "comp_sw",
    "odds_sw",
    "mod_sw",
    "dly_sw",
    "amp_sw",
    "fx2_sw",
    "rev_sw",
    "pdlfx_sw",
    "comp_type",
    "odds_type",
    "mod_type",
    "dly_type",
    "amp_type",
    "fx2_type",
    "pdlfx_type",
    "rev_type",
    "comp1",
    "comp2",
    "comp3",
    "odds1",
    "odds2",
    "odds3",
    "mod1",
    "mod2",
    "mod3",
    "dly1",
    "dly2",
    "dly3",
    "amp1",
    "amp2",
    "amp3",
    "amp4",
    "amp5",
    "fx2_1",
    "fx2_2",
    "fx2_3",
    "fx2_4",
    "ctl_target_h",
    "ctl_target_l",
    "ctrl_knob_value",
    "ctl_mode",
    "ns_thresh",
    "rev",
    "modulation_bpm_h",
    "modulation_bpm_l",
    "delay_bpm_h",
    "delay_bpm_l",
    "value_dummy_1_h",
    "value_dummy_1_l",
    "value_dummy_2_h",
    "value_dummy_2_l",
    "value_dummy_3_h",
    "value_dummy_3_l",
    "value_dummy_4_h",
    "value_dummy_4_l",
];

pub const COMP_TYPES: [&str; 11] = [
    "COMP",
    "T.WAH UP",
    "T.WAH DOWN",
    "OCTAVE",
    "SLOW GEAR",
    "DEFRETTER",
    "RING MOD",
    "AC SIM",
    "Single>Hum",
    "Hum>Single",
    "SOLO",
];
pub const ODDS_TYPES: [&str; 11] = [
    "BOOST",
    "OVERDRIVE",
    "T-SCREAM",
    "BLUES",
    "TURBO OD",
    "DISTORTION",
    "TURBO DS",
    "METAL DS",
    "CORE",
    "FUZZ",
    "OCT FUZZ",
];
pub const MOD_TYPES: [&str; 11] = [
    "PHASER",
    "FLANGER",
    "TREMOLO",
    "CHORUS",
    "VIBRATO",
    "PITCH SHIFT",
    "HARMONIST",
    "ROTARY",
    "UNI-V",
    "DELAY",
    "OVERTONE",
];
pub const DLY_TYPES: [&str; 11] = [
    "1-99 ms",
    "100-600 ms",
    "500-6000 ms",
    "ANALOG",
    "TAPE",
    "MODULATE",
    "REVERSE",
    "CHO + DELAY",
    "TEMPO",
    "TERA ECHO",
    "PHRASE LOOP",
];
pub const AMP_TYPES: [&str; 9] = [
    "AC", "CLEAN", "TWEED", "CRUNCH", "COMBO", "LEAD", "DRIVE", "STACK", "METAL",
];
pub const FX2_TYPES: [&str; 6] = ["PHASER", "TREMOLO", "BOOST", "DELAY", "CHORUS", "EQ"];
pub const PDLFX_TYPES: [&str; 10] = [
    "WAH",
    "VOICE",
    "+1 OCT",
    "+2 OCT",
    "-1 OCT",
    "FREEZE",
    "OSC DELAY",
    "OD/DS",
    "MOD RATE",
    "DELAY LEV",
];
pub const REV_TYPES: [&str; 3] = ["ROOM", "HALL", "SPRING"];

#[derive(Clone)]
pub struct Patch {
    pub original: Vec<u8>,
    pub data: Vec<u8>,
}

pub fn validate(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() != PATCH_SIZE {
        return Err(format!(
            "Temporary patch must contain exactly {PATCH_SIZE} bytes; received {}.",
            bytes.len()
        ));
    }
    if bytes.iter().any(|b| *b > 0x7f) {
        return Err("Temporary patch contains a byte outside the 7-bit MIDI range.".into());
    }
    Ok(())
}

pub fn effect_types() -> Value {
    json!({"comp": COMP_TYPES, "odds": ODDS_TYPES, "mod": MOD_TYPES, "dly": DLY_TYPES,
        "amp": AMP_TYPES, "fx2": FX2_TYPES, "pdlfx": PDLFX_TYPES, "rev": REV_TYPES})
}

fn label(types: &[&str], value: u8) -> Value {
    types.get(value as usize).map_or(Value::Null, |s| json!(s))
}

pub fn name(bytes: &[u8]) -> String {
    String::from_utf8_lossy(&bytes[..16])
        .trim_end_matches(' ')
        .to_string()
}

pub fn padded_name(bytes: &[u8]) -> String {
    String::from_utf8_lossy(&bytes[..16]).to_string()
}

pub fn decode(b: &[u8]) -> Result<Value, String> {
    validate(b)?;
    let padded = padded_name(b);
    Ok(json!({
        "name": {"text": padded.trim_end_matches(' '), "padded": padded, "bytes": &b[0..16]},
        "switches": {"comp":b[0x10],"odds":b[0x11],"mod":b[0x12],"dly":b[0x13],"amp":b[0x14],"fx2":b[0x15],"rev":b[0x16],"pdlfx":b[0x17]},
        "types": {"comp":b[0x18],"odds":b[0x19],"mod":b[0x1a],"dly":b[0x1b],"amp":b[0x1c],"fx2":b[0x1d],"pdlfx":b[0x1e],"rev":b[0x1f]},
        "typeNames": {"comp":label(&COMP_TYPES,b[0x18]),"odds":label(&ODDS_TYPES,b[0x19]),"mod":label(&MOD_TYPES,b[0x1a]),"dly":label(&DLY_TYPES,b[0x1b]),"amp":label(&AMP_TYPES,b[0x1c]),"fx2":label(&FX2_TYPES,b[0x1d]),"pdlfx":label(&PDLFX_TYPES,b[0x1e]),"rev":label(&REV_TYPES,b[0x1f])},
        "parameters": {"comp":&b[0x20..0x23],"odds":&b[0x23..0x26],"mod":&b[0x26..0x29],"dly":&b[0x29..0x2c],"amp":&b[0x2c..0x31],"fx2":&b[0x31..0x35]},
        "control": {"targetBytes":&b[0x35..0x37],"knobValue":b[0x37],"mode":b[0x38],"assignmentType":if b[0x37] == 100 {"effects"} else {"knob"}},
        "noiseSuppressorThreshold":b[0x39], "reverbLevel":b[0x3a],
        "bpmBytes":{"modulation":&b[0x3b..0x3d],"delay":&b[0x3d..0x3f]},
        "dummyBytes":[&b[0x3f..0x41],&b[0x41..0x43],&b[0x43..0x45],&b[0x45..0x47]]
    }))
}

fn safe_range(field: &str) -> Option<(u8, u8)> {
    if field.ends_with("_sw") {
        return Some((0, 1));
    }
    let type_max = match field {
        "comp_type" | "odds_type" | "mod_type" | "dly_type" => Some(10),
        "amp_type" => Some(8),
        "fx2_type" => Some(5),
        "pdlfx_type" => Some(9),
        "rev_type" => Some(2),
        _ => None,
    };
    if let Some(max) = type_max {
        return Some((0, max));
    }
    if matches!(
        field,
        "comp1"
            | "comp2"
            | "comp3"
            | "odds1"
            | "odds2"
            | "odds3"
            | "mod1"
            | "mod2"
            | "mod3"
            | "dly1"
            | "dly2"
            | "dly3"
            | "amp1"
            | "amp2"
            | "amp3"
            | "amp4"
            | "amp5"
            | "fx2_1"
            | "fx2_2"
            | "fx2_3"
            | "fx2_4"
    ) {
        return Some((0, 99));
    }
    match field {
        "ctl_target_h" | "ctl_target_l" => Some((0, 15)),
        "ctrl_knob_value" => Some((0, 100)),
        "ctl_mode" => Some((0, 1)),
        "ns_thresh" => Some((0, 50)),
        "rev" => Some((0, 49)),
        _ => None,
    }
}

pub fn edit(
    patch: &Patch,
    changes: &[(String, u8)],
    new_name: Option<&str>,
) -> Result<Patch, String> {
    let mut data = patch.data.clone();
    for (field, value) in changes {
        let offset = FIELDS
            .iter()
            .position(|f| f == field)
            .ok_or_else(|| format!("Unknown patch field '{field}'."))?;
        let (min, max) = safe_range(field).ok_or_else(|| {
            format!("Field {field} is locked because its safe semantics are not confirmed.")
        })?;
        if *value < min || *value > max {
            return Err(format!(
                "Field {field} must be {min}-{max}; received {value}."
            ));
        }
        data[offset] = *value;
    }
    if let Some(value) = new_name {
        if value.is_empty()
            || value.len() > 16
            || !value.bytes().all(|b| (0x20..=0x7e).contains(&b))
        {
            return Err("Patch name must contain 1-16 printable ASCII characters.".into());
        }
        let padded = format!("{value:<16}");
        data[..16].copy_from_slice(padded.as_bytes());
    }
    Ok(Patch {
        original: patch.original.clone(),
        data,
    })
}

pub fn differences(before: &[u8], after: &[u8]) -> Vec<Value> {
    before
        .iter()
        .zip(after)
        .enumerate()
        .filter_map(|(offset, (a, b))| {
            (a != b).then(|| json!({"offset":offset,"field":FIELDS[offset],"before":a,"after":b}))
        })
        .collect()
}

pub fn from_tsl_params(params: &Map<String, Value>) -> Result<Vec<u8>, String> {
    FIELDS
        .iter()
        .map(|field| {
            let value = params
                .get(*field)
                .ok_or_else(|| format!("TSL field {field} is missing."))?;
            let parsed = if matches!(*field, "ctl_target_h" | "ctl_target_l") {
                u8::from_str_radix(
                    value
                        .as_str()
                        .ok_or_else(|| format!("TSL field {field} must be hexadecimal text."))?,
                    16,
                )
                .map_err(|_| format!("TSL field {field} is invalid."))?
            } else if let Some(n) = value.as_u64() {
                u8::try_from(n).map_err(|_| format!("TSL field {field} is invalid."))?
            } else {
                value
                    .as_str()
                    .ok_or_else(|| format!("TSL field {field} must be decimal text."))?
                    .parse::<u8>()
                    .map_err(|_| format!("TSL field {field} is invalid."))?
            };
            if parsed > 0x7f {
                return Err(format!("TSL field {field} exceeds the MIDI byte range."));
            }
            Ok(parsed)
        })
        .collect()
}

pub fn to_tsl_params(data: &[u8]) -> Result<Map<String, Value>, String> {
    validate(data)?;
    Ok(FIELDS
        .iter()
        .zip(data)
        .map(|(field, value)| {
            let text = if matches!(*field, "ctl_target_h" | "ctl_target_l") {
                format!("{value:02X}")
            } else {
                value.to_string()
            };
            ((*field).to_string(), Value::String(text))
        })
        .collect())
}

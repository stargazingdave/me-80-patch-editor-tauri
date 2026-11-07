use std::process::ExitCode;

fn parse_byte(value: &str) -> Result<u8, String> {
    if value.len() != 2 {
        return Err(format!("'{value}' is not a two-digit hexadecimal byte."));
    }
    let byte = u8::from_str_radix(value, 16)
        .map_err(|_| format!("'{value}' is not a hexadecimal byte."))?;
    if byte > 0x7f {
        return Err(format!("'{value}' is outside the 7-bit MIDI range."));
    }
    Ok(byte)
}

fn run() -> Result<(), String> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args.first().map(String::as_str) == Some("listen-editor") {
        if args.len() != 2 {
            return Err("Usage: me80-discovery listen-editor MILLISECONDS".into());
        }
        let milliseconds = args[1]
            .parse::<u64>()
            .map_err(|_| "Listening duration must be an integer number of milliseconds.".to_string())?;
        let result = me_80_patch_editor_lib::run_editor_mode_discovery_listen(milliseconds)?;
        println!("{}", serde_json::to_string_pretty(&result).unwrap());
        return Ok(());
    }
    if args.first().map(String::as_str) == Some("write-test") {
        if args.len() != 6 {
            return Err("Usage: me80-discovery write-test AA BB CC DD VV".into());
        }
        let bytes = args[1..]
            .iter()
            .map(|value| parse_byte(value))
            .collect::<Result<Vec<_>, _>>()?;
        let result = me_80_patch_editor_lib::run_reversible_discovery_write_test(
            bytes[0..4].try_into().unwrap(),
            bytes[4],
        )?;
        println!("{}", serde_json::to_string_pretty(&result).unwrap());
        return Ok(());
    }
    if args.first().map(String::as_str) == Some("write") {
        if args.len() != 6 {
            return Err("Usage: me80-discovery write AA BB CC DD VV".into());
        }
        let bytes = args[1..]
            .iter()
            .map(|value| parse_byte(value))
            .collect::<Result<Vec<_>, _>>()?;
        let result = me_80_patch_editor_lib::run_verified_discovery_write(
            bytes[0..4].try_into().unwrap(),
            bytes[4],
        )?;
        println!("{}", serde_json::to_string_pretty(&result).unwrap());
        return Ok(());
    }
    if args.first().map(String::as_str) == Some("write-editor") {
        if args.len() != 6 {
            return Err("Usage: me80-discovery write-editor AA BB CC DD VV".into());
        }
        let bytes = args[1..]
            .iter()
            .map(|value| parse_byte(value))
            .collect::<Result<Vec<_>, _>>()?;
        let result = me_80_patch_editor_lib::run_verified_discovery_write_in_editor_mode(
            bytes[0..4].try_into().unwrap(),
            bytes[4],
        )?;
        println!("{}", serde_json::to_string_pretty(&result).unwrap());
        return Ok(());
    }
    if args.len() != 8 {
        return Err("Usage: me80-discovery AA BB CC DD SS TT UU VV".into());
    }
    let bytes = args
        .iter()
        .map(|value| parse_byte(value))
        .collect::<Result<Vec<_>, _>>()?;
    let result = me_80_patch_editor_lib::run_read_only_discovery_probe(
        bytes[0..4].try_into().unwrap(),
        bytes[4..8].try_into().unwrap(),
    )?;
    println!("{}", serde_json::to_string_pretty(&result).unwrap());
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

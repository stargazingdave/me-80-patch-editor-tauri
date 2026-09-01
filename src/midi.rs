use chrono::Utc;
use midir::{Ignore, MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use regex::Regex;
use serde::Serialize;
use std::{
    sync::mpsc::{self, Receiver},
    time::{Duration, Instant},
};

use crate::{
    patch::PATCH_SIZE,
    sysex::{parse_dt1, Dt1, DEVICE_ID},
};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PortView {
    pub index: usize,
    pub name: String,
    pub normal: bool,
}

#[derive(Serialize, Clone)]
pub struct MidiLog {
    pub direction: String,
    pub timestamp: String,
    pub hex: String,
    pub decimal: String,
}

fn normal(name: &str) -> bool {
    Regex::new(r"(?i)^\s*ME[\s_-]?80\s*$")
        .unwrap()
        .is_match(name)
}

pub fn ports() -> Result<(Vec<PortView>, Vec<PortView>), String> {
    let input = MidiInput::new("me-80-patch-editor input").map_err(|e| e.to_string())?;
    let output = MidiOutput::new("me-80-patch-editor output").map_err(|e| e.to_string())?;
    let inputs = input
        .ports()
        .iter()
        .enumerate()
        .map(|(index, p)| {
            let name = input
                .port_name(p)
                .unwrap_or_else(|_| "Unknown MIDI input".into());
            PortView {
                index,
                normal: normal(&name),
                name,
            }
        })
        .collect();
    let outputs = output
        .ports()
        .iter()
        .enumerate()
        .map(|(index, p)| {
            let name = output
                .port_name(p)
                .unwrap_or_else(|_| "Unknown MIDI output".into());
            PortView {
                index,
                normal: normal(&name),
                name,
            }
        })
        .collect();
    Ok((inputs, outputs))
}

pub struct Session {
    _input: MidiInputConnection<()>,
    output: MidiOutputConnection,
    rx: Receiver<Vec<u8>>,
    pub logs: Vec<MidiLog>,
}

impl Session {
    pub fn open(input_index: usize, output_index: usize) -> Result<Self, String> {
        let mut input = MidiInput::new("me-80-patch-editor input").map_err(|e| e.to_string())?;
        input.ignore(Ignore::None);
        let output = MidiOutput::new("me-80-patch-editor output").map_err(|e| e.to_string())?;
        let input_ports = input.ports();
        let output_ports = output.ports();
        let ip = input_ports
            .get(input_index)
            .ok_or("Selected MIDI input no longer exists.")?;
        let op = output_ports
            .get(output_index)
            .ok_or("Selected MIDI output no longer exists.")?;
        let input_name = input.port_name(ip).map_err(|e| e.to_string())?;
        let output_name = output.port_name(op).map_err(|e| e.to_string())?;
        if !normal(&input_name) || !normal(&output_name) {
            return Err(
                "Both selected endpoints must be named exactly ME-80; DAW CTRL is rejected.".into(),
            );
        }
        let (tx, rx) = mpsc::channel();
        let input_connection = input
            .connect(
                ip,
                "me-80-patch-editor receive",
                move |_, message, _| {
                    let _ = tx.send(message.to_vec());
                },
                (),
            )
            .map_err(|e| e.to_string())?;
        let output_connection = output
            .connect(op, "me-80-patch-editor send")
            .map_err(|e| e.to_string())?;
        Ok(Self {
            _input: input_connection,
            output: output_connection,
            rx,
            logs: Vec::new(),
        })
    }

    fn record(&mut self, direction: &str, bytes: &[u8]) {
        self.logs.push(MidiLog {
            direction: direction.into(),
            timestamp: Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            hex: bytes
                .iter()
                .map(|b| format!("{b:02X}"))
                .collect::<Vec<_>>()
                .join(" "),
            decimal: bytes
                .iter()
                .map(u8::to_string)
                .collect::<Vec<_>>()
                .join(" "),
        });
    }

    pub fn send(&mut self, bytes: &[u8]) -> Result<(), String> {
        self.record("TX", bytes);
        self.output.send(bytes).map_err(|e| e.to_string())
    }

    pub fn request(&mut self, request: &[u8], address: [u8; 4]) -> Result<Dt1, String> {
        self.send(request)?;
        let start = Instant::now();
        loop {
            let remaining = Duration::from_secs(5)
                .checked_sub(start.elapsed())
                .ok_or("Timed out waiting for the ME-80; no retry was sent.")?;
            let message = self
                .rx
                .recv_timeout(remaining)
                .map_err(|_| "Timed out waiting for the ME-80; no retry was sent.".to_string())?;
            self.record("RX", &message);
            if message.first() != Some(&0xf0) {
                continue;
            }
            let parsed =
                parse_dt1(&message)?.ok_or("Unexpected SysEx while waiting for ME-80 DT1 data.")?;
            if parsed.device_id != DEVICE_ID {
                return Err(format!(
                    "Unexpected ME-80 device ID 0x{:02X}.",
                    parsed.device_id
                ));
            }
            if parsed.address != address {
                return Err(format!(
                    "Unexpected response address {}.",
                    parsed
                        .address
                        .iter()
                        .map(|b| format!("{b:02X}"))
                        .collect::<Vec<_>>()
                        .join(" ")
                ));
            }
            if !parsed.checksum_valid {
                return Err("ME-80 response checksum was invalid.".into());
            }
            if parsed.data.len() != PATCH_SIZE {
                return Err(format!(
                    "ME-80 response contained {}, not 71, patch bytes.",
                    parsed.data.len()
                ));
            }
            return Ok(parsed);
        }
    }
}

use crate::patch::PATCH_SIZE;

pub const DEVICE_ID: u8 = 0x10;
const MODEL_ID: [u8; 4] = [0, 0, 0, 1];

#[derive(Debug)]
pub struct Dt1 {
    pub device_id: u8,
    pub address: [u8; 4],
    pub data: Vec<u8>,
    pub received_checksum: u8,
    pub checksum_valid: bool,
}

pub struct Slot {
    pub label: String,
    pub user: bool,
    pub address: [u8; 4],
}

pub fn checksum(bytes: &[u8]) -> u8 {
    (128 - (bytes.iter().map(|b| *b as u32).sum::<u32>() & 0x7f)) as u8 & 0x7f
}

pub fn rq1(address: [u8; 4], size: [u8; 4]) -> Vec<u8> {
    let mut body = Vec::from(address);
    body.extend(size);
    let mut out = vec![0xf0, 0x41, DEVICE_ID, 0, 0, 0, 1, 0x11];
    out.extend(&body);
    out.push(checksum(&body));
    out.push(0xf7);
    out
}

pub fn dt1(address: [u8; 4], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.is_empty() || data.iter().any(|b| *b > 0x7f) {
        return Err("DT1 data must contain 7-bit bytes.".into());
    }
    let mut body = Vec::from(address);
    body.extend(data);
    let mut out = vec![0xf0, 0x41, DEVICE_ID, 0, 0, 0, 1, 0x12];
    out.extend(&body);
    out.push(checksum(&body));
    out.push(0xf7);
    Ok(out)
}

pub fn parse_dt1(message: &[u8]) -> Result<Option<Dt1>, String> {
    if message.len() < 14
        || message[0] != 0xf0
        || message[message.len() - 1] != 0xf7
        || message[1] != 0x41
        || message[3..7] != MODEL_ID
        || message[7] != 0x12
    {
        return Ok(None);
    }
    let address: [u8; 4] = message[8..12].try_into().unwrap();
    let data = message[12..message.len() - 2].to_vec();
    if data.iter().any(|b| *b > 0x7f) {
        return Err("DT1 data contains a non-7-bit byte.".into());
    }
    let received = message[message.len() - 2];
    let mut checked = address.to_vec();
    checked.extend(&data);
    Ok(Some(Dt1 {
        device_id: message[2],
        address,
        data,
        received_checksum: received,
        checksum_valid: received == checksum(&checked),
    }))
}

pub fn slot(value: &str) -> Result<Slot, String> {
    let text = value.trim().to_ascii_uppercase();
    let bytes = text.as_bytes();
    if bytes.len() != 4
        || !matches!(bytes[0], b'U' | b'P')
        || !(b'1'..=b'9').contains(&bytes[1])
        || bytes[2] != b'-'
        || !(b'1'..=b'4').contains(&bytes[3])
    {
        return Err(format!(
            "Invalid patch slot '{value}'. Expected U1-1 through U9-4 or P1-1 through P9-4."
        ));
    }
    let bank = bytes[1] - b'1';
    let number = bytes[3] - b'1';
    let ordinal = bank * 4 + number;
    let user = bytes[0] == b'U';
    Ok(Slot {
        label: text,
        user,
        address: [0x20, (if user { 0x01 } else { 0x25 }) + ordinal, 0, 0],
    })
}

pub fn stored_rq1(label: &str) -> Result<Vec<u8>, String> {
    let s = slot(label)?;
    Ok(rq1(s.address, [0, 0, 0, PATCH_SIZE as u8]))
}

pub fn temp_rq1() -> Vec<u8> {
    rq1([0x20, 0, 0, 0], [0, 0, 0, PATCH_SIZE as u8])
}

pub fn editor_mode_on() -> Vec<u8> {
    dt1([0x7f, 0, 0, 1], &[1]).expect("editor mode is valid DT1")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn known_temp_request() {
        assert_eq!(
            temp_rq1(),
            vec![240, 65, 16, 0, 0, 0, 1, 17, 32, 0, 0, 0, 0, 0, 0, 71, 25, 247]
        );
    }
    #[test]
    fn slots() {
        assert_eq!(slot("U9-4").unwrap().address, [0x20, 0x24, 0, 0]);
        assert_eq!(slot("P1-1").unwrap().address, [0x20, 0x25, 0, 0]);
    }
    #[test]
    fn known_editor_mode_on_message() {
        assert_eq!(
            editor_mode_on(),
            vec![0xf0, 0x41, 0x10, 0, 0, 0, 1, 0x12, 0x7f, 0, 0, 1, 1, 0x7f, 0xf7]
        );
    }
}

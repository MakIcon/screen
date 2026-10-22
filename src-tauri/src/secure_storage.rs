use crate::commands::errors::{CommandError, ErrorCode};
#[cfg(windows)]
use std::ptr::{null, null_mut};

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    },
};

/// Encrypt bytes for the current Windows user with DPAPI. The ciphertext can
/// be stored on disk, but cannot be decrypted by another Windows account.
#[cfg(windows)]
pub fn protect(data: &[u8]) -> Result<Vec<u8>, CommandError> {
    let input_length = u32::try_from(data.len())
        .map_err(|_| CommandError::new(ErrorCode::InvalidInput, "Secret is too large"))?;
    let input = CRYPT_INTEGER_BLOB {
        cbData: input_length,
        pbData: data.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB::default();

    let succeeded = unsafe {
        CryptProtectData(
            &input,
            null(),
            null(),
            null(),
            null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if succeeded == 0 {
        return Err(CommandError::new(
            ErrorCode::Authentication,
            format!(
                "Windows DPAPI encryption failed: {}",
                std::io::Error::last_os_error()
            ),
        ));
    }

    let encrypted =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        LocalFree(output.pbData.cast());
    }
    Ok(encrypted)
}

/// Decrypt bytes previously encrypted by [`protect`] for the current user.
#[cfg(windows)]
pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, CommandError> {
    let input_length = u32::try_from(data.len())
        .map_err(|_| CommandError::new(ErrorCode::InvalidInput, "Secret is too large"))?;
    let input = CRYPT_INTEGER_BLOB {
        cbData: input_length,
        pbData: data.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB::default();

    let succeeded = unsafe {
        CryptUnprotectData(
            &input,
            null_mut(),
            null(),
            null(),
            null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if succeeded == 0 {
        return Err(CommandError::new(
            ErrorCode::Authentication,
            format!(
                "Windows DPAPI decryption failed: {}",
                std::io::Error::last_os_error()
            ),
        ));
    }

    let decrypted =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        LocalFree(output.pbData.cast());
    }
    Ok(decrypted)
}

#[cfg(not(windows))]
pub fn protect(_data: &[u8]) -> Result<Vec<u8>, CommandError> {
    Err(CommandError::new(
        ErrorCode::Unsupported,
        "Secure Microsoft account storage requires Windows DPAPI",
    ))
}

#[cfg(not(windows))]
pub fn unprotect(_data: &[u8]) -> Result<Vec<u8>, CommandError> {
    Err(CommandError::new(
        ErrorCode::Unsupported,
        "Secure Microsoft account storage requires Windows DPAPI",
    ))
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn dpapi_round_trip_uses_ciphertext() {
        let plaintext = b"screen-launcher-secret";
        let encrypted = super::protect(plaintext).unwrap();

        assert_ne!(encrypted, plaintext);
        assert_eq!(super::unprotect(&encrypted).unwrap(), plaintext);
    }
}

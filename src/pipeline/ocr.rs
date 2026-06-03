use std::path::{Path, PathBuf};

use anyhow::Context as _;
use image::Pixel as _;
use ocr_rs::{OcrEngine, OcrEngineConfig};
use tokio::{fs, io::AsyncWriteExt as _};
use tracing::{debug, info};

use super::{AnnotatedMessage, Message};

const MODEL_DIR: &str = "models/ocr";
const DET_MODEL: &str = "PP-OCRv5_mobile_det.mnn";
const EN_REC_MODEL: &str = "en_PP-OCRv5_mobile_rec_infer.mnn";
const EN_CHARSET: &str = "ppocr_keys_en.txt";
const CYRILLIC_REC_MODEL: &str = "cyrillic_PP-OCRv5_mobile_rec_infer.mnn";
const CYRILLIC_CHARSET: &str = "ppocr_keys_cyrillic.txt";
const MIN_RESULT_CONFIDENCE: f32 = 0.3;
const SCRIPT_MATCH_WEIGHT: usize = 2;
const SCRIPT_MISMATCH_WEIGHT: usize = 1;

const TIMESTAMP_MASK_LEFT_NUMERATOR: u32 = 11;
const TIMESTAMP_MASK_LEFT_DENOMINATOR: u32 = 20;
const TIMESTAMP_GRAY_DIFF_MAX: u8 = 22;
const TIMESTAMP_GRAY_MIN_CHANNEL: u8 = 90;
const TIMESTAMP_GRAY_MAX_CHANNEL: u8 = 215;

struct ModelFile {
    filename: &'static str,
    url: &'static str,
}

const MODEL_FILES: &[ModelFile] = &[
    ModelFile {
        filename: DET_MODEL,
        url: "https://raw.githubusercontent.com/zibo-chen/newbee-ocr-cli/master/models/PP-OCRv5_mobile_det.mnn",
    },
    ModelFile {
        filename: EN_REC_MODEL,
        url: "https://raw.githubusercontent.com/zibo-chen/newbee-ocr-cli/master/models/en_PP-OCRv5_mobile_rec_infer.mnn",
    },
    ModelFile {
        filename: EN_CHARSET,
        url: "https://raw.githubusercontent.com/zibo-chen/newbee-ocr-cli/master/models/ppocr_keys_en.txt",
    },
    ModelFile {
        filename: CYRILLIC_REC_MODEL,
        url: "https://raw.githubusercontent.com/zibo-chen/newbee-ocr-cli/master/models/cyrillic_PP-OCRv5_mobile_rec_infer.mnn",
    },
    ModelFile {
        filename: CYRILLIC_CHARSET,
        url: "https://raw.githubusercontent.com/zibo-chen/newbee-ocr-cli/master/models/ppocr_keys_cyrillic.txt",
    },
];

/// Downloads the OCR detection/recognition models and dictionaries used by `analyze`.
///
/// Files are stored under the hardcoded `models/ocr` directory. Existing non-empty
/// files are kept so startup does not re-download the models every time.
pub async fn init() -> anyhow::Result<()> {
    info!(model_dir = MODEL_DIR, "OCR initialization started");
    fs::create_dir_all(MODEL_DIR)
        .await
        .with_context(|| format!("failed to create OCR model directory {MODEL_DIR}"))?;

    for file in MODEL_FILES {
        let path = model_path(file.filename);
        if has_non_empty_file(&path).await? {
            debug!(filename = file.filename, "OCR model file already exists");
            continue;
        }

        info!(filename = file.filename, "downloading OCR model file");
        download_file(file.url, &path)
            .await
            .with_context(|| format!("failed to download OCR model file {}", file.filename))?;
        debug!(filename = file.filename, "downloaded OCR model file");
    }

    info!("OCR initialization finished");
    Ok(())
}

/// Recognizes text from one detected reply using full OCR detection and recognition.
///
/// The bubble analysis step finds message regions, but reply crops can still contain
/// multiple text lines, timestamps, and icons. This function runs PaddleOCR text
/// detection inside the crop first, recognizes detected text regions with English and
/// Cyrillic PP-OCRv5 models, then returns the original reply annotated with the more
/// plausible transcript based on script-specific character counts.
pub fn analyze(reply: Message) -> anyhow::Result<AnnotatedMessage> {
    info!(
        width = reply.crop.width(),
        height = reply.crop.height(),
        ?reply.side,
        "OCR analysis started"
    );
    let english = recognize_with(&reply.crop, EN_REC_MODEL, EN_CHARSET)?;
    let cyrillic = recognize_with(&reply.crop, CYRILLIC_REC_MODEL, CYRILLIC_CHARSET)?;
    let english_score = english_score(&english);
    let cyrillic_score = cyrillic_score(&cyrillic);
    let (selected_script, transcript) = if cyrillic_score > english_score {
        ("cyrillic", cyrillic)
    } else {
        ("english", english)
    };
    info!(
        selected_script,
        english_score,
        cyrillic_score,
        transcript_chars = transcript.chars().count(),
        "OCR analysis finished"
    );

    Ok(AnnotatedMessage { reply, transcript })
}

fn recognize_with(
    image: &image::DynamicImage,
    model_filename: &str,
    charset_filename: &str,
) -> anyhow::Result<String> {
    let detection_model_path = model_path(DET_MODEL);
    let recognition_model_path = model_path(model_filename);
    let charset_path = model_path(charset_filename);
    debug!(model_filename, charset_filename, "recognition pass started");

    ensure_model_file(&detection_model_path)?;
    ensure_model_file(&recognition_model_path)?;
    ensure_model_file(&charset_path)?;

    let config = OcrEngineConfig::fast().with_min_result_confidence(MIN_RESULT_CONFIDENCE);
    let engine = OcrEngine::new(
        &detection_model_path,
        &recognition_model_path,
        &charset_path,
        Some(config),
    )?;

    let preprocessed = preprocess_for_chat_ocr(image);
    let text = recognize_cleaned(&engine, &preprocessed)?;
    if text.is_empty() {
        debug!(
            model_filename,
            "preprocessed OCR result was empty; retrying original image"
        );
        recognize_cleaned(&engine, image)
    } else {
        debug!(
            model_filename,
            transcript_chars = text.chars().count(),
            "recognition pass finished"
        );
        Ok(text)
    }
}

fn recognize_cleaned(engine: &OcrEngine, image: &image::DynamicImage) -> anyhow::Result<String> {
    let mut results = engine.recognize(image)?;
    let raw_result_count = results.len();
    results.sort_by_key(|result| (result.bbox.rect.top(), result.bbox.rect.left()));

    let lines: Vec<_> = results
        .into_iter()
        .map(|result| clean_ocr_line(&result.text))
        .filter(|text| !text.is_empty())
        .collect();
    debug!(
        raw_result_count,
        cleaned_line_count = lines.len(),
        "cleaned OCR detection results"
    );

    Ok(lines.join("\n"))
}

fn preprocess_for_chat_ocr(image: &image::DynamicImage) -> image::DynamicImage {
    let mut rgba = image.to_rgba8();
    let fill_color = image::Rgba([255, 255, 255, 255]);

    let masked_pixel_count = mask_timestamp_pixels(&mut rgba, fill_color);
    debug!(masked_pixel_count, "preprocessed chat crop for OCR");

    image::DynamicImage::ImageRgba8(rgba)
}

fn mask_timestamp_pixels(image: &mut image::RgbaImage, fill_color: image::Rgba<u8>) -> u64 {
    let width = image.width();
    let height = image.height();
    let left = width * TIMESTAMP_MASK_LEFT_NUMERATOR / TIMESTAMP_MASK_LEFT_DENOMINATOR;
    let mut masked_pixel_count = 0;

    for y in 0..height {
        for x in left..width {
            if is_gray_timestamp_pixel(image.get_pixel(x, y).to_rgb().0) {
                image.put_pixel(x, y, fill_color);
                masked_pixel_count += 1;
            }
        }
    }

    masked_pixel_count
}

fn is_gray_timestamp_pixel([r, g, b]: [u8; 3]) -> bool {
    let min = r.min(g).min(b);
    let max = r.max(g).max(b);

    max.saturating_sub(min) <= TIMESTAMP_GRAY_DIFF_MAX
        && min >= TIMESTAMP_GRAY_MIN_CHANNEL
        && max <= TIMESTAMP_GRAY_MAX_CHANNEL
}

fn clean_ocr_line(text: &str) -> String {
    let without_time = remove_time_sequences(text);
    let mut cleaned = String::new();

    for character in without_time.chars() {
        if is_allowed_text_character(character) {
            cleaned.push(character);
        } else {
            cleaned.push(' ');
        }
    }

    let cleaned = collapse_spaces(&cleaned);
    if is_noise_line(&cleaned) {
        String::new()
    } else {
        cleaned
    }
}

fn remove_time_sequences(text: &str) -> String {
    let chars: Vec<_> = text.chars().collect();
    let mut cleaned = String::new();
    let mut index = 0;

    while index < chars.len() {
        if let Some(end) = time_sequence_end(&chars, index) {
            index = end;
            while chars
                .get(index)
                .is_some_and(|character| is_status_character(*character))
            {
                index += 1;
            }
            cleaned.push(' ');
        } else {
            cleaned.push(chars[index]);
            index += 1;
        }
    }

    cleaned
}

fn time_sequence_end(chars: &[char], start: usize) -> Option<usize> {
    let mut index = start;
    let mut hour_digits = 0;

    while chars
        .get(index)
        .is_some_and(|character| character.is_ascii_digit())
        && hour_digits < 2
    {
        index += 1;
        hour_digits += 1;
    }

    if hour_digits == 0 || chars.get(index) != Some(&':') {
        return None;
    }

    index += 1;
    if chars
        .get(index..index + 2)
        .is_some_and(|tail| tail.iter().all(|character| character.is_ascii_digit()))
    {
        Some(index + 2)
    } else {
        None
    }
}

fn is_status_character(character: char) -> bool {
    matches!(
        character,
        ' ' | '\t' | '√' | '✓' | '✔' | '∨' | 'v' | 'V' | '/'
    )
}

fn is_allowed_text_character(character: char) -> bool {
    character.is_alphanumeric()
        || character.is_whitespace()
        || matches!(
            character,
            '.' | ','
                | '!'
                | '?'
                | ':'
                | ';'
                | '-'
                | '\''
                | '’'
                | '"'
                | '('
                | ')'
                | '/'
                | '+'
                | '#'
                | '@'
                | '&'
                | '%'
        )
}

fn collapse_spaces(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn is_noise_line(text: &str) -> bool {
    text.is_empty() || !text.chars().any(char::is_alphanumeric)
}

fn ensure_model_file(path: &Path) -> anyhow::Result<()> {
    let metadata = std::fs::metadata(path)
        .with_context(|| format!("OCR model file is missing: {}", path.display()))?;

    anyhow::ensure!(
        metadata.len() > 0,
        "OCR model file is empty: {}",
        path.display()
    );

    Ok(())
}

async fn has_non_empty_file(path: &Path) -> anyhow::Result<bool> {
    match fs::metadata(path).await {
        Ok(metadata) => Ok(metadata.len() > 0),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error)
            .with_context(|| format!("failed to inspect OCR model file {}", path.display())),
    }
}

async fn download_file(url: &str, path: &Path) -> anyhow::Result<()> {
    let response = reqwest::get(url).await?.error_for_status()?;
    let bytes = response.bytes().await?;

    let tmp_path = path.with_extension("download");
    let mut file = fs::File::create(&tmp_path)
        .await
        .with_context(|| format!("failed to create temporary file {}", tmp_path.display()))?;
    file.write_all(&bytes).await?;
    file.flush().await?;
    drop(file);

    fs::rename(&tmp_path, path).await.with_context(|| {
        format!(
            "failed to move downloaded OCR model from {} to {}",
            tmp_path.display(),
            path.display()
        )
    })?;

    Ok(())
}

fn model_path(filename: &str) -> PathBuf {
    Path::new(MODEL_DIR).join(filename)
}

fn english_score(text: &str) -> usize {
    text.chars()
        .filter(|character| !character.is_whitespace())
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                SCRIPT_MATCH_WEIGHT
            } else if is_cyrillic(character) {
                0
            } else {
                SCRIPT_MISMATCH_WEIGHT
            }
        })
        .sum()
}

fn cyrillic_score(text: &str) -> usize {
    text.chars()
        .filter(|character| !character.is_whitespace())
        .map(|character| {
            if is_cyrillic(character) {
                SCRIPT_MATCH_WEIGHT
            } else if character.is_ascii_alphanumeric() {
                SCRIPT_MISMATCH_WEIGHT
            } else {
                SCRIPT_MISMATCH_WEIGHT
            }
        })
        .sum()
}

fn is_cyrillic(character: char) -> bool {
    matches!(character, '\u{0400}'..='\u{04ff}' | '\u{0500}'..='\u{052f}')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_timestamps_status_marks_and_symbol_noise() {
        assert_eq!(clean_ocr_line("Axax 20:50 √"), "Axax");
        assert_eq!(
            clean_ocr_line("Я себе стримую від поганих жартів 20:50"),
            "Я себе стримую від поганих жартів"
        );
        assert_eq!(clean_ocr_line(")20:50"), "");
        assert_eq!(clean_ocr_line("____________________"), "");
    }
}

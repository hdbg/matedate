use std::path::{Path, PathBuf};

use anyhow::Context as _;
use ocr_rs::{OcrEngine, OcrEngineConfig};
use tokio::{fs, io::AsyncWriteExt as _};

const MODEL_DIR: &str = "models/ocr";
const DET_MODEL: &str = "PP-OCRv5_mobile_det.mnn";
const EN_REC_MODEL: &str = "en_PP-OCRv5_mobile_rec_infer.mnn";
const EN_CHARSET: &str = "ppocr_keys_en.txt";
const CYRILLIC_REC_MODEL: &str = "cyrillic_PP-OCRv5_mobile_rec_infer.mnn";
const CYRILLIC_CHARSET: &str = "ppocr_keys_cyrillic.txt";
const MIN_RESULT_CONFIDENCE: f32 = 0.3;
const SCRIPT_MATCH_WEIGHT: usize = 2;
const SCRIPT_MISMATCH_WEIGHT: usize = 1;

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
    fs::create_dir_all(MODEL_DIR)
        .await
        .with_context(|| format!("failed to create OCR model directory {MODEL_DIR}"))?;

    for file in MODEL_FILES {
        let path = model_path(file.filename);
        if has_non_empty_file(&path).await? {
            continue;
        }

        download_file(file.url, &path)
            .await
            .with_context(|| format!("failed to download OCR model file {}", file.filename))?;
    }

    Ok(())
}

/// Recognizes text from one image using full OCR detection and recognition.
///
/// The bubble analysis step finds message regions, but those crops can still contain
/// multiple text lines, quote previews, timestamps, and icons. This function runs
/// PaddleOCR text detection inside the crop first, recognizes detected text regions
/// with English and Cyrillic PP-OCRv5 models, then returns the more plausible result
/// based on script-specific character counts.
pub fn analyze(image: &image::DynamicImage) -> anyhow::Result<String> {
    let english = recognize_with(image, EN_REC_MODEL, EN_CHARSET)?;
    let cyrillic = recognize_with(image, CYRILLIC_REC_MODEL, CYRILLIC_CHARSET)?;

    if cyrillic_score(&cyrillic) > english_score(&english) {
        Ok(cyrillic)
    } else {
        Ok(english)
    }
}

fn recognize_with(
    image: &image::DynamicImage,
    model_filename: &str,
    charset_filename: &str,
) -> anyhow::Result<String> {
    let detection_model_path = model_path(DET_MODEL);
    let recognition_model_path = model_path(model_filename);
    let charset_path = model_path(charset_filename);

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

    let mut results = engine.recognize(image)?;
    results.sort_by_key(|result| (result.bbox.rect.top(), result.bbox.rect.left()));

    Ok(results
        .into_iter()
        .map(|result| result.text.trim().to_owned())
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n"))
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

use super::{AnnotatedReply, Side};

const MIN_QUOTED_LINE_CHARS: usize = 4;
const SHORT_QUOTED_LINE_MAX_CHARS: usize = 8;
const SHORT_QUOTED_LINE_MATCH_THRESHOLD: f32 = 0.9;
const QUOTED_LINE_MATCH_THRESHOLD: f32 = 0.72;

/// Removes quoted/replied-to text from recognized chat transcripts.
///
/// The OCR stage recognizes all text inside a detected bubble crop, including quoted
/// snippets from prior messages. This function walks replies in display order, keeps
/// normalized line history separately for each side, and if a message contains a line
/// that closely matches a previous line from the opposite side, drops all lines before
/// and including that matched quote line.
pub fn analyze(replies: Vec<AnnotatedReply>) -> anyhow::Result<Vec<AnnotatedReply>> {
    let mut us_history = Vec::new();
    let mut they_history = Vec::new();
    let mut processed = Vec::with_capacity(replies.len());

    for mut annotated in replies {
        let opposite_history = match annotated.reply.side {
            Side::Us => &they_history,
            Side::They => &us_history,
        };
        annotated.transcript = remove_quoted_prefix(&annotated.transcript, opposite_history);
        let stripped_history_lines = normalized_lines(&annotated.transcript);

        match annotated.reply.side {
            Side::Us => us_history.extend(stripped_history_lines),
            Side::They => they_history.extend(stripped_history_lines),
        }

        processed.push(annotated);
    }

    Ok(processed)
}

fn remove_quoted_prefix(text: &str, opposite_history: &[String]) -> String {
    if opposite_history.is_empty() {
        return text.trim().to_owned();
    }

    let lines: Vec<_> = text.lines().map(str::trim).collect();
    let quote_end = lines
        .iter()
        .rposition(|line| matches_previous_opposite_line(line, opposite_history));

    match quote_end {
        Some(index) => lines[index + 1..].join("\n").trim().to_owned(),
        None => text.trim().to_owned(),
    }
}

fn matches_previous_opposite_line(line: &str, opposite_history: &[String]) -> bool {
    let normalized = normalize_transcript_line(line);
    if normalized.chars().count() < MIN_QUOTED_LINE_CHARS {
        return false;
    }

    let best_similarity = opposite_history
        .iter()
        .map(|history_line| levenshtein_similarity(&normalized, history_line))
        .fold(0.0, f32::max);
    let threshold = if normalized.chars().count() <= SHORT_QUOTED_LINE_MAX_CHARS {
        SHORT_QUOTED_LINE_MATCH_THRESHOLD
    } else {
        QUOTED_LINE_MATCH_THRESHOLD
    };

    best_similarity >= threshold
}

fn normalized_lines(text: &str) -> Vec<String> {
    text.lines()
        .map(normalize_transcript_line)
        .filter(|line| line.chars().count() >= MIN_QUOTED_LINE_CHARS)
        .collect()
}

fn normalize_transcript_line(line: &str) -> String {
    line.to_lowercase()
        .chars()
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn levenshtein_similarity(left: &str, right: &str) -> f32 {
    if left == right {
        return 1.0;
    }

    let left: Vec<_> = left.chars().collect();
    let right: Vec<_> = right.chars().collect();
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }

    let mut previous: Vec<usize> = (0..=right.len()).collect();
    let mut current = vec![0; right.len() + 1];

    for (left_index, left_char) in left.iter().enumerate() {
        current[0] = left_index + 1;

        for (right_index, right_char) in right.iter().enumerate() {
            let cost = usize::from(left_char != right_char);
            current[right_index + 1] = (previous[right_index + 1] + 1)
                .min(current[right_index] + 1)
                .min(previous[right_index] + cost);
        }

        std::mem::swap(&mut previous, &mut current);
    }

    let distance = previous[right.len()];
    1.0 - distance as f32 / left.len().max(right.len()) as f32
}

#[cfg(test)]
mod tests {
    use image::DynamicImage;

    use super::*;
    use crate::pipeline::{BoundingBox, Reply};

    fn annotated_reply(side: Side, transcript: &str) -> AnnotatedReply {
        AnnotatedReply {
            reply: Reply {
                side,
                bbox: BoundingBox {
                    top_left: (0, 0),
                    top_right: (1, 1),
                },
                crop: DynamicImage::new_rgba8(1, 1),
            },
            transcript: transcript.to_owned(),
        }
    }

    #[test]
    fn removes_reply_quote_prefix_when_line_matches_opposite_side_history() -> anyhow::Result<()> {
        let replies = vec![
            annotated_reply(Side::They, "Та я по триндіти поки хотів"),
            annotated_reply(
                Side::Us,
                "Санич Ноу-боллсовіч\nТа я по триндіти поки хотів\nТоді трохи пізніше",
            ),
        ];

        let stripped = analyze(replies)?;

        assert_eq!(stripped[0].transcript, "Та я по триндіти поки хотів");
        assert_eq!(stripped[1].transcript, "Тоді трохи пізніше");

        Ok(())
    }

    #[test]
    fn removes_reply_quote_prefix_with_ocr_drift() {
        let previous = vec!["Ну я зараз йду хуткнькко до метро".to_owned()];

        assert_eq!(
            remove_quoted_prefix("Stanislav\nНу я зараз йду хутенько до метро\nок", &previous,),
            "ок"
        );
    }

    #[test]
    fn keeps_message_without_opposite_side_quote() {
        let previous = vec!["А що за юзкейс".to_owned()];

        assert_eq!(
            remove_quoted_prefix("І Ти вже юзав, бачу, openCV", &previous),
            "І Ти вже юзав, бачу, openCV"
        );
    }
}

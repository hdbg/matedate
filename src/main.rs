use std::sync::Arc;

use anyhow::Context as _;
use image::DynamicImage;
use teloxide::{
    Bot,
    dispatching::{MessageFilterExt as _, UpdateFilterExt as _},
    dptree,
    net::Download,
    payloads::SendPhotoSetters as _,
    prelude::{Dispatcher, Requester},
    types::{InputFile, MediaKind, MediaPhoto, Message, MessageKind, ParseMode, PhotoSize, Update},
};
use tracing::info;

use crate::pipeline::llm_classification::{LLMAnalysis, LLMContext};

const CONFIG_FILE: &str = "config.toml";
const CONFIG_ENV_PREIFX: &str = "BOT";
const EMPTY_TRANSCRIPT_MESSAGE: &str = "No message bubbles recognized.";
const ANNOTATED_IMAGE_NAME: &str = "annotated_messages.png";

mod pipeline;

#[derive(serde::Deserialize)]
pub struct Config {
    pub token: String,
    pub llm: pipeline::llm_classification::LLMConfig,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    pipeline::ocr::init().await?;

    let settings = config::Config::builder()
        .add_source(config::File::with_name(CONFIG_FILE))
        .add_source(config::Environment::with_prefix(CONFIG_ENV_PREIFX))
        .build()?;

    let settings: Config = settings.try_deserialize()?;
    let bot = Bot::new(settings.token);
    let llm_context = Arc::new(LLMContext::new(&settings.llm)?);

    info!("boot");

    let schema = Update::filter_message()
        .branch(
            dptree::filter_map(|msg: Message| {
                let media = match &msg.kind {
                    MessageKind::Common(common) => match &common.media_kind {
                        MediaKind::Photo(photo) => Some(photo.clone()),

                        _ => None,
                    },

                    _ => None,
                }?;

                Some((msg, media))
            })
            .endpoint(
                async |bot: Bot,
                       llm_context: Arc<LLMContext>,
                       (message, media): (Message, MediaPhoto)|
                       -> anyhow::Result<()> {
                    handle_transcript_photo(bot, llm_context, message, media).await
                },
            ),
        )
        .branch(Message::filter_document().endpoint(
            async |bot: Bot, message: Message| -> anyhow::Result<()> {
                let Some(sender) = message.from else {
                    return Ok(());
                };
                bot.send_message(
                    sender.id,
                    "Send images 'compressed', instead of 'as document'",
                )
                .await?;

                Ok(())
            },
        ));
    Dispatcher::builder(bot, schema)
        .dependencies(dptree::deps![llm_context])
        .build()
        .dispatch()
        .await;

    unreachable!("Bot should never stop")
}

async fn handle_transcript_photo(
    bot: Bot,
    llm_context: Arc<LLMContext>,
    message: Message,
    media: MediaPhoto,
) -> anyhow::Result<()> {
    info!("Received photo!");

    let photo = media
        .photo
        .into_iter()
        .max_by_key(|photo| u64::from(photo.width) * u64::from(photo.height))
        .context("received photo message without photo sizes")?;
    let image = download_photo(&bot, photo).await?;
    let images = vec![image];

    let messages = pipeline::bubble_analysis::analyze(&images)?;
    let sent_count = messages
        .iter()
        .filter(|m| matches!(m.side, pipeline::Side::Us))
        .count();
    let received_count = messages.len() - sent_count;
    let total_bbox_area: i64 = messages
        .iter()
        .map(|m| {
            i64::from(m.bbox.top_right.0 - m.bbox.top_left.0)
                * i64::from(m.bbox.top_right.1 - m.bbox.top_left.1)
        })
        .sum();
    let total_crop_pixels: u64 = messages
        .iter()
        .map(|m| u64::from(m.crop.width()) * u64::from(m.crop.height()))
        .sum();
    let annotated_messages = messages
        .iter()
        .cloned()
        .map(pipeline::ocr::analyze)
        .collect::<anyhow::Result<Vec<_>>>()?;
    let annotated_messages = pipeline::transcript_processing::analyze(annotated_messages)?;
    let recognized_char_count: usize = annotated_messages
        .iter()
        .map(|m| m.transcript.chars().count())
        .sum();
    let analysis = pipeline::llm_classification::analyze(&llm_context, annotated_messages).await?;
    let annotated_image =
        pipeline::annotation::render_marked_messages(&images[0], &analysis.moves)?;
    info!(
        message_count = messages.len(),
        sent_count,
        received_count,
        total_bbox_area,
        total_crop_pixels,
        recognized_message_count = analysis.moves.len(),
        recognized_char_count,
        elo = analysis.elo,
        "processed all images"
    );
    bot.send_photo(
        message.chat.id,
        InputFile::memory(annotated_image).file_name(ANNOTATED_IMAGE_NAME),
    )
    .caption(format_analysis(&analysis))
    .parse_mode(ParseMode::Html)
    .await?;

    Ok(())
}

async fn download_photo(bot: &Bot, photo: PhotoSize) -> anyhow::Result<DynamicImage> {
    let mut buf = Vec::new();
    let file = bot.get_file(photo.file.id).await?;
    bot.download_file(&file.path, &mut buf).await?;

    image::load_from_memory(&buf).context("failed to decode Telegram photo")
}

fn format_analysis(analysis: &LLMAnalysis) -> String {
    if analysis.moves.is_empty() {
        return EMPTY_TRANSCRIPT_MESSAGE.to_owned();
    }

    format!(
        r#"
<b>{}</b>

<i>{}</i>

<b>Elo Affected: {:+}</b>
        "#,
        escape_html(&analysis.title),
        escape_html(&analysis.description),
        analysis.elo
    )
    .trim()
    .to_owned()
}

fn escape_html(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len());

    for character in text.chars() {
        match character {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            _ => escaped.push(character),
        }
    }

    escaped
}

use std::io::Cursor;

use anyhow::Context as _;
use image::{DynamicImage, ImageFormat, Rgba};
use imageproc::{drawing::draw_hollow_rect_mut, rect::Rect as ImageRect};
use teloxide::{
    Bot,
    dispatching::{MessageFilterExt as _, UpdateFilterExt as _},
    dptree,
    net::Download,
    prelude::{Dispatcher, Requester},
    types::{InputFile, MediaKind, MediaPhoto, Message, MessageKind, PhotoSize, Update},
};
use tracing::info;

#[derive(serde::Deserialize)]
pub struct Config {
    pub token: String,
}

const CONFIG_FILE: &str = "config.toml";
const CONFIG_ENV_PREIFX: &str = "BOT";
const EMPTY_TRANSCRIPT_MESSAGE: &str = "No message bubbles recognized.";
const DETECTED_BUBBLES_IMAGE_NAME: &str = "detected_bubbles.png";
const RECTANGLE_STROKE_WIDTH: i32 = 3;
const RECTANGLE_COLOR: Rgba<u8> = Rgba([255, 0, 0, 255]);

mod pipeline;

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
                async |bot: Bot, (message, media): (Message, MediaPhoto)| -> anyhow::Result<()> {
                    handle_transcript_photo(bot, message, media).await
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
    Dispatcher::builder(bot, schema).build().dispatch().await;

    unreachable!("Bot should never stop")
}

async fn handle_transcript_photo(
    bot: Bot,
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

    let replies = pipeline::bubble_analysis::analyze(&images)?;
    let sent_count = replies
        .iter()
        .filter(|reply| matches!(reply.side, pipeline::Side::Us))
        .count();
    let received_count = replies.len() - sent_count;
    let total_bbox_area: i64 = replies
        .iter()
        .map(|reply| {
            i64::from(reply.bbox.top_right.0 - reply.bbox.top_left.0)
                * i64::from(reply.bbox.top_right.1 - reply.bbox.top_left.1)
        })
        .sum();
    let total_crop_pixels: u64 = replies
        .iter()
        .map(|reply| u64::from(reply.crop.width()) * u64::from(reply.crop.height()))
        .sum();
    let annotated_image = render_detected_bubbles(&images[0], &replies)?;
    let annotated_replies = replies
        .iter()
        .cloned()
        .map(pipeline::ocr::analyze)
        .collect::<anyhow::Result<Vec<_>>>()?;
    let annotated_replies = pipeline::transcript_processing::analyze(annotated_replies)?;
    let recognized_char_count: usize = annotated_replies
        .iter()
        .map(|reply| reply.transcript.chars().count())
        .sum();
    let transcript = format_transcript(&annotated_replies);
    info!(
        message_count = replies.len(),
        sent_count,
        received_count,
        total_bbox_area,
        total_crop_pixels,
        recognized_message_count = annotated_replies.len(),
        recognized_char_count,
        "processed all images"
    );
    bot.send_message(message.chat.id, transcript).await?;
    bot.send_photo(
        message.chat.id,
        InputFile::memory(annotated_image).file_name(DETECTED_BUBBLES_IMAGE_NAME),
    )
    .await?;

    Ok(())
}

async fn download_photo(bot: &Bot, photo: PhotoSize) -> anyhow::Result<DynamicImage> {
    let mut buf = Vec::new();
    let file = bot.get_file(photo.file.id).await?;
    bot.download_file(&file.path, &mut buf).await?;

    image::load_from_memory(&buf).context("failed to decode Telegram photo")
}

fn render_detected_bubbles(
    image: &DynamicImage,
    replies: &[pipeline::Reply],
) -> anyhow::Result<Vec<u8>> {
    let mut annotated = image.to_rgba8();

    for reply in replies {
        let rect_width = u32::try_from(reply.bbox.top_right.0 - reply.bbox.top_left.0)?;
        let rect_height = u32::try_from(reply.bbox.top_right.1 - reply.bbox.top_left.1)?;

        for offset in 0..RECTANGLE_STROKE_WIDTH {
            let x = reply.bbox.top_left.0 - offset;
            let y = reply.bbox.top_left.1 - offset;
            let width = rect_width + u32::try_from(offset * 2)?;
            let height = rect_height + u32::try_from(offset * 2)?;

            draw_hollow_rect_mut(
                &mut annotated,
                ImageRect::at(x, y).of_size(width, height),
                RECTANGLE_COLOR,
            );
        }
    }

    let mut output = Vec::new();
    DynamicImage::ImageRgba8(annotated)
        .write_to(&mut Cursor::new(&mut output), ImageFormat::Png)
        .context("failed to encode annotated image")?;

    Ok(output)
}

fn format_transcript(replies: &[pipeline::AnnotatedReply]) -> String {
    if replies.is_empty() {
        return EMPTY_TRANSCRIPT_MESSAGE.to_owned();
    }

    let mut transcript = String::from("Transcript:\n");
    for annotated in replies {
        let side = match annotated.reply.side {
            pipeline::Side::They => "They",
            pipeline::Side::Us => "Us",
        };
        let text = annotated.transcript.trim();
        let text = if text.is_empty() {
            "[unrecognized]"
        } else {
            text
        };

        transcript.push_str(side);
        transcript.push_str(": ");
        transcript.push_str(text);
        transcript.push('\n');
    }

    transcript
}

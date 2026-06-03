use std::io::Cursor;

use anyhow::Context as _;
use image::{
    DynamicImage, ImageFormat,
    imageops::{self, FilterType},
};

use super::{MOVE_IMAGES, MarkedMessage, MoveKind, Side};

pub fn render_marked_messages(
    image: &DynamicImage,
    marked: &[MarkedMessage],
) -> anyhow::Result<Vec<u8>> {
    let mut canvas = image.to_rgba8();
    let canvas_width = canvas.width() as i64;
    let canvas_height = canvas.height() as i64;

    for marked in marked {
        let bbox = &marked.annotated.reply.bbox;
        let bbox_height = bbox.top_right.1 - bbox.top_left.1;
        if bbox_height <= 0 {
            continue;
        }

        let move_image = load_move_image(&marked.kind)?;
        let aspect = move_image.width() as f32 / move_image.height() as f32;
        let target_height = bbox_height as u32;
        let target_width = (target_height as f32 * aspect).round().max(1.0) as u32;
        let scaled = imageops::resize(
            &move_image,
            target_width,
            target_height,
            FilterType::Lanczos3,
        );

        let (raw_x, raw_y) = match marked.annotated.reply.side {
            Side::They => (bbox.top_right.0 as i64, bbox.top_left.1 as i64),
            Side::Us => (
                bbox.top_left.0 as i64 - target_width as i64,
                bbox.top_left.1 as i64,
            ),
        };
        let x = raw_x.clamp(0, (canvas_width - target_width as i64).max(0));
        let y = raw_y.clamp(0, (canvas_height - target_height as i64).max(0));

        imageops::overlay(&mut canvas, &scaled, x, y);
    }

    let mut output = Vec::new();
    DynamicImage::ImageRgba8(canvas)
        .write_to(&mut Cursor::new(&mut output), ImageFormat::Png)
        .context("failed to encode annotated image")?;
    Ok(output)
}

fn load_move_image(kind: &MoveKind) -> anyhow::Result<image::RgbaImage> {
    let filename = move_image_filename(kind);
    let file = MOVE_IMAGES
        .get_file(filename)
        .with_context(|| format!("move image not found: {filename}"))?;
    let img = image::load_from_memory(file.contents())
        .with_context(|| format!("failed to decode move image: {filename}"))?;
    Ok(img.to_rgba8())
}

fn move_image_filename(kind: &MoveKind) -> &'static str {
    match kind {
        MoveKind::Best => "best.png",
        MoveKind::Excellent => "excellent.png",
        MoveKind::Good => "good.png",
        MoveKind::Inaccuracy => "inaccuracy.png",
        MoveKind::Miss => "miss.png",
        MoveKind::Mistake => "mistake.png",
        MoveKind::Blunder => "blunder.png",
        MoveKind::SuperRisky => "superrisky.png",
        MoveKind::Risky => "risky.png",
        MoveKind::Book => "book.png",
    }
}

use super::{
    BoundingBox, Message, Side,
    image_utils::{self, clamp_i32},
};
use opencv::{
    core::{self, Mat, MatTraitConst as _, Point, Rect, Scalar, Size, Vector},
    imgproc,
};
use tracing::{debug, info};

#[derive(kameo::Actor, Clone, Default)]
pub struct BubbleAnalysisProcessor;

#[kameo::messages]
impl BubbleAnalysisProcessor {
    #[message]
    pub fn analyze(&mut self, images: Vec<image::DynamicImage>) -> anyhow::Result<Vec<Message>> {
        analyze(&images)
    }
}

const SIDE_SPLIT_DIVISOR: i32 = 2;
const MASK_ON: u8 = 255;
const SINGLE_CHANNEL_COUNT: i32 = 1;
const RGB_CHANNEL_COUNT: i32 = 3;

const LIGHT_BACKGROUND_MIN_CHANNEL: u8 = 220;
const LIGHT_BACKGROUND_DIFF_THRESHOLD: u8 = 10;
const DEFAULT_BACKGROUND_DIFF_THRESHOLD: u8 = 18;

const HSV_MIN_HUE: f64 = 0.0;
const HSV_MAX_HUE: f64 = 179.0;
const HSV_MIN_SATURATION: f64 = 24.0;
const HSV_MAX_SATURATION: f64 = 255.0;
const HSV_MIN_VALUE: f64 = 35.0;
const HSV_MAX_VALUE: f64 = 255.0;

const GAUSSIAN_KERNEL_SIZE: i32 = 5;
const GAUSSIAN_SIGMA: f64 = 0.0;
const CANNY_LOW_THRESHOLD: f64 = 45.0;
const CANNY_HIGH_THRESHOLD: f64 = 135.0;

const EDGE_CLOSE_WIDTH_DIVISOR: i32 = 45;
const EDGE_CLOSE_WIDTH_MIN: i32 = 8;
const EDGE_CLOSE_WIDTH_MAX: i32 = 32;
const EDGE_CLOSE_HEIGHT_DIVISOR: i32 = 180;
const EDGE_CLOSE_HEIGHT_MIN: i32 = 3;
const EDGE_CLOSE_HEIGHT_MAX: i32 = 8;
const EDGE_DILATE_WIDTH_DIVISOR: i32 = 120;
const EDGE_DILATE_WIDTH_MIN: i32 = 3;
const EDGE_DILATE_WIDTH_MAX: i32 = 9;
const EDGE_DILATE_HEIGHT_DIVISOR: i32 = 180;
const EDGE_DILATE_HEIGHT_MIN: i32 = 3;
const EDGE_DILATE_HEIGHT_MAX: i32 = 8;

const EDGE_RECT_PAD_WIDTH_DIVISOR: i32 = 80;
const EDGE_RECT_PAD_X_MIN: i32 = 6;
const EDGE_RECT_PAD_X_MAX: i32 = 18;
const EDGE_RECT_PAD_HEIGHT_DIVISOR: i32 = 160;
const EDGE_RECT_PAD_Y_MIN: i32 = 4;
const EDGE_RECT_PAD_Y_MAX: i32 = 14;
const RECT_PAD_X: i32 = 4;
const RECT_PAD_Y: i32 = 3;
const MERGE_RECT_PAD: i32 = 4;

const BUBBLE_OPEN_KERNEL_SIZE: i32 = 3;
const BUBBLE_HORIZONTAL_WIDTH_DIVISOR: i32 = 24;
const BUBBLE_HORIZONTAL_WIDTH_MIN: i32 = 12;
const BUBBLE_HORIZONTAL_WIDTH_MAX: i32 = 48;
const BUBBLE_HORIZONTAL_HEIGHT_DIVISOR: i32 = 240;
const BUBBLE_HORIZONTAL_HEIGHT_MIN: i32 = 3;
const BUBBLE_HORIZONTAL_HEIGHT_MAX: i32 = 8;
const BUBBLE_BLOCK_WIDTH_DIVISOR: i32 = 90;
const BUBBLE_BLOCK_WIDTH_MIN: i32 = 5;
const BUBBLE_BLOCK_WIDTH_MAX: i32 = 16;
const BUBBLE_BLOCK_HEIGHT_DIVISOR: i32 = 120;
const BUBBLE_BLOCK_HEIGHT_MIN: i32 = 5;
const BUBBLE_BLOCK_HEIGHT_MAX: i32 = 14;

const MIN_BUBBLE_WIDTH_DIVISOR: i32 = 16;
const MIN_BUBBLE_WIDTH_MIN: i32 = 28;
const MIN_BUBBLE_WIDTH_MAX: i32 = 80;
const MIN_BUBBLE_HEIGHT_DIVISOR: i32 = 70;
const MIN_BUBBLE_HEIGHT_MIN: i32 = 16;
const MIN_BUBBLE_HEIGHT_MAX: i32 = 34;
const MIN_BUBBLE_AREA_DIVISOR: i32 = 900;
const MAX_BUBBLE_AREA_DIVISOR: i32 = 2;
const MAX_BUBBLE_WIDTH_NUMERATOR: i32 = 19;
const MAX_BUBBLE_WIDTH_DENOMINATOR: i32 = 20;
const MAX_BUBBLE_HEIGHT_NUMERATOR: i32 = 3;
const MAX_BUBBLE_HEIGHT_DENOMINATOR: i32 = 5;
const ASPECT_RATIO_SCALE: i32 = 100;
const MAX_BUBBLE_ASPECT_RATIO_X100: i32 = 2600;
const LEFT_ALIGNMENT_DIVISOR: i32 = 4;
const RIGHT_ALIGNMENT_NUMERATOR: i32 = 3;
const RIGHT_ALIGNMENT_DENOMINATOR: i32 = 4;

/// Detects chat message bubbles in screenshots.
///
/// Each input image is treated as a screenshot from a chat application. The output is
/// returned in image order and top-to-bottom order within each image. Each `Message`
/// contains the inferred side, a detected bubble rectangle, and an owned crop of that
/// bubble region. The current `BoundingBox` type has two points; `top_left` is the
/// rectangle origin and `top_right` is populated with the opposite lower-right corner.
///
/// The detector converts the image to OpenCV matrices, builds bubble candidate masks
/// from background/color differences, adds edge-based candidates, merges overlapping
/// boxes, filters unlikely rectangles, then classifies side from horizontal alignment.
pub fn analyze(images: &Vec<image::DynamicImage>) -> anyhow::Result<Vec<Message>> {
    info!(image_count = images.len(), "bubble analysis started");
    let mut messages = Vec::new();

    for (image_index, image) in images.iter().enumerate() {
        let rgb = image.to_rgb8();
        debug!(
            image_index,
            width = rgb.width(),
            height = rgb.height(),
            "preparing image for bubble detection"
        );
        let bgr = rgb_to_bgr_mat(&rgb)?;
        let image_width = bgr.cols();
        let rects = detect_bubble_rects(&bgr, &rgb)?;
        debug!(
            image_index,
            rect_count = rects.len(),
            "detected bubble rectangles for image"
        );

        for rect in rects {
            let side =
                if rect.x + rect.width / SIDE_SPLIT_DIVISOR < image_width / SIDE_SPLIT_DIVISOR {
                    Side::They
                } else {
                    Side::Us
                };

            debug!(
                image_index,
                x = rect.x,
                y = rect.y,
                width = rect.width,
                height = rect.height,
                ?side,
                "accepted message bubble"
            );
            messages.push(Message {
                side,
                bbox: BoundingBox {
                    top_left: (rect.x, rect.y),
                    top_right: (rect.x + rect.width, rect.y + rect.height),
                },
                crop: crop_bubble(image, rect)?,
            });
        }
    }

    info!(message_count = messages.len(), "bubble analysis finished");
    Ok(messages)
}

fn crop_bubble(image: &image::DynamicImage, rect: Rect) -> anyhow::Result<image::DynamicImage> {
    Ok(image.crop_imm(
        u32::try_from(rect.x)?,
        u32::try_from(rect.y)?,
        u32::try_from(rect.width)?,
        u32::try_from(rect.height)?,
    ))
}

fn detect_bubble_rects(bgr: &Mat, rgb: &image::RgbImage) -> anyhow::Result<Vec<Rect>> {
    let width = bgr.cols();
    let height = bgr.rows();
    debug!(width, height, "detecting bubble rectangles");

    if width <= 0 || height <= 0 {
        debug!(width, height, "skipping empty image");
        return Ok(Vec::new());
    }

    let background_mask = background_difference_mask(rgb)?;
    let color_mask = saturated_color_mask(bgr)?;
    let mut bubble_mask = Mat::default();
    core::bitwise_or_def(&background_mask, &color_mask, &mut bubble_mask)?;

    let bubble_mask = prepare_bubble_mask(&bubble_mask, width, height)?;
    let mut rects = rects_from_mask(&bubble_mask)?;
    let mask_rect_count = rects.len();

    let edge_mask = edge_mask(bgr, width, height)?;
    let edge_rects = rects_from_mask(&edge_mask)?;
    let edge_rect_count = edge_rects.len();
    rects.extend(edge_rects.into_iter().map(|rect| {
        expand_rect(
            rect,
            width,
            height,
            clamp_i32(
                width / EDGE_RECT_PAD_WIDTH_DIVISOR,
                EDGE_RECT_PAD_X_MIN,
                EDGE_RECT_PAD_X_MAX,
            ),
            clamp_i32(
                height / EDGE_RECT_PAD_HEIGHT_DIVISOR,
                EDGE_RECT_PAD_Y_MIN,
                EDGE_RECT_PAD_Y_MAX,
            ),
        )
    }));
    debug!(
        mask_rect_count,
        edge_rect_count,
        total_candidate_count = rects.len(),
        "collected raw bubble candidates"
    );

    let mut rects: Vec<_> = rects
        .into_iter()
        .map(|rect| expand_rect(rect, width, height, RECT_PAD_X, RECT_PAD_Y))
        .filter(|rect| plausible_bubble_rect(*rect, width, height))
        .collect();
    debug!(
        plausible_candidate_count = rects.len(),
        "filtered plausible bubble candidates"
    );

    merge_overlapping_rects(&mut rects, width, height);
    rects.retain(|rect| plausible_bubble_rect(*rect, width, height));
    rects.sort_by_key(|rect| (rect.y, rect.x));
    debug!(
        final_rect_count = rects.len(),
        "finished bubble rectangle detection"
    );

    Ok(rects)
}

fn rgb_to_bgr_mat(image: &image::RgbImage) -> opencv::Result<Mat> {
    let height = i32::try_from(image.height())
        .map_err(|_| opencv::Error::new(core::StsOutOfRange, "image height is too large"))?;
    let mat = Mat::from_slice(image.as_raw())?;
    let rgb = mat.reshape(RGB_CHANNEL_COUNT, height)?.try_clone()?;
    let mut bgr = Mat::default();
    imgproc::cvt_color_def(&rgb, &mut bgr, imgproc::COLOR_RGB2BGR)?;
    Ok(bgr)
}

fn background_difference_mask(image: &image::RgbImage) -> opencv::Result<Mat> {
    let background = image_utils::dominant_rgb_color(image);
    let threshold = if background
        .iter()
        .all(|channel| *channel >= LIGHT_BACKGROUND_MIN_CHANNEL)
    {
        LIGHT_BACKGROUND_DIFF_THRESHOLD
    } else {
        DEFAULT_BACKGROUND_DIFF_THRESHOLD
    };
    debug!(
        ?background,
        threshold, "building background difference mask"
    );
    let mut mask = Vec::with_capacity((image.width() * image.height()) as usize);

    for pixel in image.pixels() {
        let [r, g, b] = pixel.0;
        let max_diff = r
            .abs_diff(background[0])
            .max(g.abs_diff(background[1]))
            .max(b.abs_diff(background[2]));

        mask.push(if max_diff >= threshold { MASK_ON } else { 0 });
    }

    mask_mat(&mask, image.height())
}

fn saturated_color_mask(bgr: &Mat) -> opencv::Result<Mat> {
    let mut hsv = Mat::default();
    imgproc::cvt_color_def(bgr, &mut hsv, imgproc::COLOR_BGR2HSV)?;

    let mut mask = Mat::default();
    core::in_range(
        &hsv,
        &Scalar::new(HSV_MIN_HUE, HSV_MIN_SATURATION, HSV_MIN_VALUE, 0.0),
        &Scalar::new(HSV_MAX_HUE, HSV_MAX_SATURATION, HSV_MAX_VALUE, 0.0),
        &mut mask,
    )?;
    Ok(mask)
}

fn edge_mask(bgr: &Mat, width: i32, height: i32) -> opencv::Result<Mat> {
    let mut gray = Mat::default();
    imgproc::cvt_color_def(bgr, &mut gray, imgproc::COLOR_BGR2GRAY)?;

    let mut blurred = Mat::default();
    imgproc::gaussian_blur_def(
        &gray,
        &mut blurred,
        Size::new(GAUSSIAN_KERNEL_SIZE, GAUSSIAN_KERNEL_SIZE),
        GAUSSIAN_SIGMA,
    )?;

    let mut edges = Mat::default();
    imgproc::canny_def(
        &blurred,
        &mut edges,
        CANNY_LOW_THRESHOLD,
        CANNY_HIGH_THRESHOLD,
    )?;

    let close_kernel = imgproc::get_structuring_element_def(
        imgproc::MORPH_RECT,
        Size::new(
            clamp_i32(
                width / EDGE_CLOSE_WIDTH_DIVISOR,
                EDGE_CLOSE_WIDTH_MIN,
                EDGE_CLOSE_WIDTH_MAX,
            ),
            clamp_i32(
                height / EDGE_CLOSE_HEIGHT_DIVISOR,
                EDGE_CLOSE_HEIGHT_MIN,
                EDGE_CLOSE_HEIGHT_MAX,
            ),
        ),
    )?;
    let mut closed = Mat::default();
    imgproc::morphology_ex_def(&edges, &mut closed, imgproc::MORPH_CLOSE, &close_kernel)?;

    let dilate_kernel = imgproc::get_structuring_element_def(
        imgproc::MORPH_RECT,
        Size::new(
            clamp_i32(
                width / EDGE_DILATE_WIDTH_DIVISOR,
                EDGE_DILATE_WIDTH_MIN,
                EDGE_DILATE_WIDTH_MAX,
            ),
            clamp_i32(
                height / EDGE_DILATE_HEIGHT_DIVISOR,
                EDGE_DILATE_HEIGHT_MIN,
                EDGE_DILATE_HEIGHT_MAX,
            ),
        ),
    )?;
    let mut dilated = Mat::default();
    imgproc::dilate_def(&closed, &mut dilated, &dilate_kernel)?;

    Ok(dilated)
}

fn prepare_bubble_mask(mask: &Mat, width: i32, height: i32) -> opencv::Result<Mat> {
    let open_kernel = imgproc::get_structuring_element_def(
        imgproc::MORPH_RECT,
        Size::new(BUBBLE_OPEN_KERNEL_SIZE, BUBBLE_OPEN_KERNEL_SIZE),
    )?;
    let mut opened = Mat::default();
    imgproc::morphology_ex_def(mask, &mut opened, imgproc::MORPH_OPEN, &open_kernel)?;

    let horizontal_kernel = imgproc::get_structuring_element_def(
        imgproc::MORPH_RECT,
        Size::new(
            clamp_i32(
                width / BUBBLE_HORIZONTAL_WIDTH_DIVISOR,
                BUBBLE_HORIZONTAL_WIDTH_MIN,
                BUBBLE_HORIZONTAL_WIDTH_MAX,
            ),
            clamp_i32(
                height / BUBBLE_HORIZONTAL_HEIGHT_DIVISOR,
                BUBBLE_HORIZONTAL_HEIGHT_MIN,
                BUBBLE_HORIZONTAL_HEIGHT_MAX,
            ),
        ),
    )?;
    let mut horizontally_closed = Mat::default();
    imgproc::morphology_ex_def(
        &opened,
        &mut horizontally_closed,
        imgproc::MORPH_CLOSE,
        &horizontal_kernel,
    )?;

    let block_kernel = imgproc::get_structuring_element_def(
        imgproc::MORPH_RECT,
        Size::new(
            clamp_i32(
                width / BUBBLE_BLOCK_WIDTH_DIVISOR,
                BUBBLE_BLOCK_WIDTH_MIN,
                BUBBLE_BLOCK_WIDTH_MAX,
            ),
            clamp_i32(
                height / BUBBLE_BLOCK_HEIGHT_DIVISOR,
                BUBBLE_BLOCK_HEIGHT_MIN,
                BUBBLE_BLOCK_HEIGHT_MAX,
            ),
        ),
    )?;
    let mut closed = Mat::default();
    imgproc::morphology_ex_def(
        &horizontally_closed,
        &mut closed,
        imgproc::MORPH_CLOSE,
        &block_kernel,
    )?;

    Ok(closed)
}

fn rects_from_mask(mask: &Mat) -> opencv::Result<Vec<Rect>> {
    let mut contours = Vector::<Vector<Point>>::new();
    imgproc::find_contours_def(
        mask,
        &mut contours,
        imgproc::RETR_EXTERNAL,
        imgproc::CHAIN_APPROX_SIMPLE,
    )?;

    let mut rects = Vec::with_capacity(contours.len());
    for index in 0..contours.len() {
        rects.push(imgproc::bounding_rect(&contours.get(index)?)?);
    }

    Ok(rects)
}

fn mask_mat(mask: &[u8], height: u32) -> opencv::Result<Mat> {
    let height = i32::try_from(height)
        .map_err(|_| opencv::Error::new(core::StsOutOfRange, "image height is too large"))?;
    let mat = Mat::from_slice(mask)?;
    mat.reshape(SINGLE_CHANNEL_COUNT, height)?.try_clone()
}

fn plausible_bubble_rect(rect: Rect, image_width: i32, image_height: i32) -> bool {
    if rect.width <= 0 || rect.height <= 0 {
        return false;
    }

    let image_area = image_width * image_height;
    let area = rect.width * rect.height;
    let min_width = clamp_i32(
        image_width / MIN_BUBBLE_WIDTH_DIVISOR,
        MIN_BUBBLE_WIDTH_MIN,
        MIN_BUBBLE_WIDTH_MAX,
    );
    let min_height = clamp_i32(
        image_height / MIN_BUBBLE_HEIGHT_DIVISOR,
        MIN_BUBBLE_HEIGHT_MIN,
        MIN_BUBBLE_HEIGHT_MAX,
    );

    if rect.width < min_width || rect.height < min_height {
        return false;
    }

    if area < image_area / MIN_BUBBLE_AREA_DIVISOR || area > image_area / MAX_BUBBLE_AREA_DIVISOR {
        return false;
    }

    if rect.width > image_width * MAX_BUBBLE_WIDTH_NUMERATOR / MAX_BUBBLE_WIDTH_DENOMINATOR
        || rect.height > image_height * MAX_BUBBLE_HEIGHT_NUMERATOR / MAX_BUBBLE_HEIGHT_DENOMINATOR
    {
        return false;
    }

    if rect.width * ASPECT_RATIO_SCALE / rect.height > MAX_BUBBLE_ASPECT_RATIO_X100 {
        return false;
    }

    let starts_near_left = rect.x <= image_width / LEFT_ALIGNMENT_DIVISOR;
    let ends_near_right = rect.x + rect.width
        >= image_width * RIGHT_ALIGNMENT_NUMERATOR / RIGHT_ALIGNMENT_DENOMINATOR;

    starts_near_left || ends_near_right
}

fn merge_overlapping_rects(rects: &mut Vec<Rect>, image_width: i32, image_height: i32) {
    let mut changed = true;
    while changed {
        changed = false;

        'outer: for i in 0..rects.len() {
            for j in (i + 1)..rects.len() {
                let left = expand_rect(
                    rects[i],
                    image_width,
                    image_height,
                    MERGE_RECT_PAD,
                    MERGE_RECT_PAD,
                );
                let right = expand_rect(
                    rects[j],
                    image_width,
                    image_height,
                    MERGE_RECT_PAD,
                    MERGE_RECT_PAD,
                );

                if intersects(left, right) || contains(left, right) || contains(right, left) {
                    rects[i] = union_rect(rects[i], rects[j]);
                    rects.remove(j);
                    changed = true;
                    break 'outer;
                }
            }
        }
    }
}

fn expand_rect(rect: Rect, image_width: i32, image_height: i32, pad_x: i32, pad_y: i32) -> Rect {
    let x1 = (rect.x - pad_x).max(0);
    let y1 = (rect.y - pad_y).max(0);
    let x2 = (rect.x + rect.width + pad_x).min(image_width);
    let y2 = (rect.y + rect.height + pad_y).min(image_height);

    Rect::new(x1, y1, (x2 - x1).max(0), (y2 - y1).max(0))
}

fn union_rect(left: Rect, right: Rect) -> Rect {
    let x1 = left.x.min(right.x);
    let y1 = left.y.min(right.y);
    let x2 = (left.x + left.width).max(right.x + right.width);
    let y2 = (left.y + left.height).max(right.y + right.height);

    Rect::new(x1, y1, x2 - x1, y2 - y1)
}

fn intersects(left: Rect, right: Rect) -> bool {
    left.x < right.x + right.width
        && left.x + left.width > right.x
        && left.y < right.y + right.height
        && left.y + left.height > right.y
}

fn contains(outer: Rect, inner: Rect) -> bool {
    outer.x <= inner.x
        && outer.y <= inner.y
        && outer.x + outer.width >= inner.x + inner.width
        && outer.y + outer.height >= inner.y + inner.height
}

#[cfg(test)]
mod tests {
    use image::{DynamicImage, ImageBuffer, Rgb};
    use imageproc::{
        drawing::{draw_filled_rect_mut, draw_line_segment_mut},
        rect::Rect as ImageRect,
    };

    use super::*;

    #[test]
    fn detects_left_and_right_message_bubbles_with_scribble() -> anyhow::Result<()> {
        let mut image = ImageBuffer::from_pixel(420, 720, Rgb([246, 246, 246]));

        draw_filled_rect_mut(
            &mut image,
            ImageRect::at(22, 90).of_size(190, 58),
            Rgb([232, 232, 232]),
        );
        draw_filled_rect_mut(
            &mut image,
            ImageRect::at(150, 180).of_size(246, 76),
            Rgb([84, 158, 255]),
        );

        draw_line_segment_mut(
            &mut image,
            (180.0, 205.0),
            (360.0, 236.0),
            Rgb([20, 20, 20]),
        );
        draw_line_segment_mut(
            &mut image,
            (350.0, 198.0),
            (190.0, 242.0),
            Rgb([20, 20, 20]),
        );

        let images = vec![DynamicImage::ImageRgb8(image)];
        let replies = analyze(&images)?;

        assert_eq!(replies.len(), 2);
        assert_eq!(replies[0].side, Side::They);
        assert_eq!(replies[1].side, Side::Us);
        assert!(replies[1].bbox.top_left.0 < 170);
        assert!(replies[1].bbox.top_right.0 > 380);
        assert_eq!(
            replies[1].crop.width(),
            (replies[1].bbox.top_right.0 - replies[1].bbox.top_left.0) as u32
        );
        assert_eq!(
            replies[1].crop.height(),
            (replies[1].bbox.top_right.1 - replies[1].bbox.top_left.1) as u32
        );

        Ok(())
    }
}

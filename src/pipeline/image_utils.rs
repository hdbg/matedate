use std::collections::HashMap;

pub const WHITE_RGB: [u8; 3] = [255, 255, 255];

const DOMINANT_COLOR_SAMPLE_DIVISOR: u32 = 600;
const RGB_BUCKET_SHIFT: u16 = 4;

pub fn dominant_rgb_color(image: &image::RgbImage) -> [u8; 3] {
    let step = ((image.width().max(image.height()) / DOMINANT_COLOR_SAMPLE_DIVISOR) + 1) as usize;
    let mut buckets: HashMap<u16, (usize, u32, u32, u32)> = HashMap::new();

    for (index, pixel) in image.pixels().enumerate() {
        if index % step != 0 {
            continue;
        }

        let [r, g, b] = pixel.0;
        let key = ((u16::from(r) >> RGB_BUCKET_SHIFT) << (RGB_BUCKET_SHIFT * 2))
            | ((u16::from(g) >> RGB_BUCKET_SHIFT) << RGB_BUCKET_SHIFT)
            | (u16::from(b) >> RGB_BUCKET_SHIFT);
        let entry = buckets.entry(key).or_insert((0, 0, 0, 0));
        entry.0 += 1;
        entry.1 += u32::from(r);
        entry.2 += u32::from(g);
        entry.3 += u32::from(b);
    }

    buckets
        .into_values()
        .max_by_key(|(count, _, _, _)| *count)
        .map(|(count, r, g, b)| {
            [
                (r / count as u32) as u8,
                (g / count as u32) as u8,
                (b / count as u32) as u8,
            ]
        })
        .unwrap_or(WHITE_RGB)
}

pub fn clamp_i32(value: i32, min: i32, max: i32) -> i32 {
    value.max(min).min(max)
}

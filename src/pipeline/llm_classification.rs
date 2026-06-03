use include_dir::{Dir, include_dir};
use serde::{Deserialize, Serialize};

static MOVE_IMAGES: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/assets");

#[derive(Serialize, Deserialize)]
pub enum MoveKind {
    Best,
    Excellent,
    Good,
    Inaccuracy,
    Miss,
    Mistake,
    Blunder,

    SuperRisky,
    Risky,
}

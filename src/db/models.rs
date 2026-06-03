use diesel::{Insertable, Queryable, Selectable, sqlite::Sqlite};
use restructed::Models;

use crate::db::models::types::SqliteTimestamp;

use super::schema::{games, moves, users};

pub mod types {
    use chrono::{DateTime, Utc};
    use diesel::{
        backend::Backend,
        deserialize::{FromSql, FromSqlRow},
        expression::AsExpression,
        serialize::{IsNull, ToSql},
        sql_types::Integer,
        sqlite::{Sqlite, SqliteType},
    };

    #[derive(Debug, FromSqlRow, AsExpression, Clone)]
    #[diesel(sql_type = Integer)]
    #[repr(transparent)]
    pub struct SqliteTimestamp(pub DateTime<Utc>);

    impl SqliteTimestamp {
        pub fn now() -> Self {
            Self(Utc::now())
        }
    }

    impl From<DateTime<Utc>> for SqliteTimestamp {
        fn from(dt: DateTime<Utc>) -> Self {
            Self(dt)
        }
    }

    impl From<SqliteTimestamp> for DateTime<Utc> {
        fn from(ts: SqliteTimestamp) -> Self {
            ts.0
        }
    }

    impl ToSql<Integer, Sqlite> for SqliteTimestamp {
        fn to_sql<'b>(
            &'b self,
            out: &mut diesel::serialize::Output<'b, '_, Sqlite>,
        ) -> diesel::serialize::Result {
            let unix_timestamp = self.0.timestamp();
            out.set_value(unix_timestamp);
            Ok(IsNull::No)
        }
    }

    impl FromSql<Integer, Sqlite> for SqliteTimestamp {
        fn from_sql(
            mut bytes: <Sqlite as Backend>::RawValue<'_>,
        ) -> diesel::deserialize::Result<Self> {
            let Some(SqliteType::Long) = bytes.value_type() else {
                return Err(format!(
                    "Expected Integer type for SqliteTimestamp, got {:?}",
                    bytes.value_type()
                )
                .into());
            };

            let unix_timestamp = bytes.read_long();
            let datetime =
                DateTime::from_timestamp(unix_timestamp, 0).ok_or("Timestamp is out of bounds")?;

            Ok(Self(datetime))
        }
    }
}

#[derive(Models, Queryable, Debug, Insertable, Selectable)]
#[diesel(table_name = users, check_for_backend(Sqlite))]
#[view(
    NewUser,
    derive(Insertable),
    omit(id, created_at),
    attributes_with = "deriveless"
)]
pub struct User {
    pub id: i32,
    pub telegram_id: i64,
    pub elo_rating: i32,
    pub created_at: SqliteTimestamp,
}

#[derive(Models, Queryable, Debug, Insertable, Selectable)]
#[diesel(table_name = games, check_for_backend(Sqlite))]
#[view(
    NewGame,
    derive(Insertable),
    omit(id, created_at),
    attributes_with = "deriveless"
)]
pub struct Game {
    pub id: i32,
    pub user_id: i32,
    pub hash: String,
    pub title: String,
    pub description: String,
    pub elo_delta: i32,
    pub created_at: SqliteTimestamp,
}

#[derive(Models, Queryable, Debug, Insertable, Selectable)]
#[diesel(table_name = moves, check_for_backend(Sqlite))]
#[view(
    NewMove,
    derive(Insertable),
    omit(id, created_at),
    attributes_with = "deriveless"
)]
pub struct Move {
    pub id: i32,
    pub game_id: i32,
    pub content: String,
    pub side: String,
    pub kind: String,
    pub created_at: SqliteTimestamp,
}

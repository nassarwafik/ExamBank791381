-- Phase 15A — messages, notifications, push subscriptions and the achievement feed.
-- Tables are created now and filled in Phase 15F. Streams use bigint IDENTITY ids (dense, ordered),
-- which replaces the legacy create-only "next sequence position" race; the legacy id is kept.

CREATE TABLE dbo.messages (
  message_id           bigint IDENTITY(1, 1) NOT NULL CONSTRAINT pk_messages PRIMARY KEY,
  school_id            nvarchar(64)   NOT NULL CONSTRAINT fk_messages_school REFERENCES dbo.schools (school_id),
  stream               varchar(16)    NOT NULL CONSTRAINT ck_messages_stream CHECK (stream IN ('direct', 'announcement')),
  student_user_id      nvarchar(64)   NULL CONSTRAINT fk_messages_student REFERENCES dbo.users (user_id),
  class_id             nvarchar(64)   NULL CONSTRAINT fk_messages_class REFERENCES dbo.classes (class_id),
  class_id_at_send     nvarchar(64)   NULL,
  sender_user_id       nvarchar(64)   NULL,
  sender_role          varchar(16)    NOT NULL CONSTRAINT ck_messages_sender_role CHECK (sender_role IN ('teacher', 'student', 'school_admin', 'platform_admin')),
  sender_display_name  nvarchar(200)  NOT NULL CONSTRAINT df_messages_sender_display_name DEFAULT N'',
  body                 nvarchar(max)  NOT NULL,
  legacy_message_id    nvarchar(128)  NULL,
  created_at           datetime2(3)   NOT NULL CONSTRAINT df_messages_created_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT ck_messages_target CHECK (
    (stream = 'direct' AND student_user_id IS NOT NULL) OR
    (stream = 'announcement' AND class_id IS NOT NULL)
  )
);
GO
CREATE INDEX ix_messages_direct ON dbo.messages (student_user_id, message_id) WHERE stream = 'direct';
GO
CREATE INDEX ix_messages_announcement ON dbo.messages (class_id, message_id) WHERE stream = 'announcement';
GO

-- "Read up to message N" per reader and stream (e.g. 'direct:<studentId>', 'announcements:<classId>').
CREATE TABLE dbo.message_read_markers (
  reader_user_id        nvarchar(64)   NOT NULL CONSTRAINT fk_message_read_markers_reader REFERENCES dbo.users (user_id),
  stream_key            nvarchar(150)  NOT NULL,
  last_read_message_id  bigint         NOT NULL,
  updated_at            datetime2(3)   NOT NULL CONSTRAINT df_message_read_markers_updated_at DEFAULT SYSUTCDATETIME(),
  row_version           rowversion     NOT NULL,
  CONSTRAINT pk_message_read_markers PRIMARY KEY (reader_user_id, stream_key)
);
GO

CREATE TABLE dbo.notifications (
  event_id          bigint IDENTITY(1, 1) NOT NULL CONSTRAINT pk_notifications PRIMARY KEY,
  school_id         nvarchar(64)   NOT NULL CONSTRAINT fk_notifications_school REFERENCES dbo.schools (school_id),
  scope             varchar(16)    NOT NULL CONSTRAINT ck_notifications_scope CHECK (scope IN ('class', 'student')),
  class_id          nvarchar(64)   NULL CONSTRAINT fk_notifications_class REFERENCES dbo.classes (class_id),
  student_user_id   nvarchar(64)   NULL CONSTRAINT fk_notifications_student REFERENCES dbo.users (user_id),
  event_type        varchar(40)    NOT NULL,
  dedupe_key        nvarchar(300)  NOT NULL,
  data_json         nvarchar(max)  NULL CONSTRAINT ck_notifications_data_json CHECK (data_json IS NULL OR ISJSON(data_json) = 1),
  legacy_event_id   nvarchar(128)  NULL,
  created_at        datetime2(3)   NOT NULL CONSTRAINT df_notifications_created_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT ck_notifications_target CHECK (
    (scope = 'class' AND class_id IS NOT NULL) OR
    (scope = 'student' AND student_user_id IS NOT NULL)
  )
);
GO
CREATE UNIQUE INDEX ux_notifications_dedupe ON dbo.notifications (dedupe_key);
GO
CREATE INDEX ix_notifications_class ON dbo.notifications (class_id, event_id) WHERE scope = 'class';
GO
CREATE INDEX ix_notifications_student ON dbo.notifications (student_user_id, event_id) WHERE scope = 'student';
GO

CREATE TABLE dbo.notification_read_state (
  student_user_id   nvarchar(64)   NOT NULL CONSTRAINT pk_notification_read_state PRIMARY KEY
                                   CONSTRAINT fk_notification_read_state_student REFERENCES dbo.users (user_id),
  through_event_id  bigint         NULL,
  read_json         nvarchar(max)  NULL CONSTRAINT ck_notification_read_state_read_json CHECK (read_json IS NULL OR ISJSON(read_json) = 1),
  updated_at        datetime2(3)   NOT NULL CONSTRAINT df_notification_read_state_updated_at DEFAULT SYSUTCDATETIME(),
  row_version       rowversion     NOT NULL
);
GO

CREATE TABLE dbo.push_subscriptions (
  subscription_id  nvarchar(64)    NOT NULL CONSTRAINT pk_push_subscriptions PRIMARY KEY,
  user_id          nvarchar(64)    NOT NULL CONSTRAINT fk_push_subscriptions_user REFERENCES dbo.users (user_id),
  endpoint_hash    char(64)        NOT NULL,
  endpoint         nvarchar(2000)  NOT NULL,
  keys_json        nvarchar(max)   NOT NULL CONSTRAINT ck_push_subscriptions_keys_json CHECK (ISJSON(keys_json) = 1),
  claim            nvarchar(128)   NULL,
  created_at       datetime2(3)    NOT NULL CONSTRAINT df_push_subscriptions_created_at DEFAULT SYSUTCDATETIME(),
  updated_at       datetime2(3)    NOT NULL CONSTRAINT df_push_subscriptions_updated_at DEFAULT SYSUTCDATETIME(),
  row_version      rowversion      NOT NULL
);
GO
CREATE UNIQUE INDEX ux_push_subscriptions_endpoint ON dbo.push_subscriptions (endpoint_hash);
GO
CREATE INDEX ix_push_subscriptions_user ON dbo.push_subscriptions (user_id);
GO

CREATE TABLE dbo.feed_posts (
  post_id          nvarchar(200)  NOT NULL CONSTRAINT pk_feed_posts PRIMARY KEY,
  school_id        nvarchar(64)   NOT NULL CONSTRAINT fk_feed_posts_school REFERENCES dbo.schools (school_id),
  class_id         nvarchar(64)   NOT NULL CONSTRAINT fk_feed_posts_class REFERENCES dbo.classes (class_id),
  student_user_id  nvarchar(64)   NOT NULL CONSTRAINT fk_feed_posts_student REFERENCES dbo.users (user_id),
  event_type       varchar(40)    NOT NULL,
  data_json        nvarchar(max)  NULL CONSTRAINT ck_feed_posts_data_json CHECK (data_json IS NULL OR ISJSON(data_json) = 1),
  reactions_json   nvarchar(max)  NULL CONSTRAINT ck_feed_posts_reactions_json CHECK (reactions_json IS NULL OR ISJSON(reactions_json) = 1),
  created_at       datetime2(3)   NOT NULL CONSTRAINT df_feed_posts_created_at DEFAULT SYSUTCDATETIME(),
  row_version      rowversion     NOT NULL
);
GO
CREATE INDEX ix_feed_posts_class ON dbo.feed_posts (class_id, created_at);
GO

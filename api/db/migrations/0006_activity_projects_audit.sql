-- Phase 15A — projects, per-student activity documents, live games, and the audit log.
-- Tables are created now and filled in Phase 15F.

CREATE TABLE dbo.project_configs (
  class_id          nvarchar(64)   NOT NULL CONSTRAINT fk_project_configs_class REFERENCES dbo.classes (class_id),
  project_code      nvarchar(16)   NOT NULL CONSTRAINT fk_project_configs_course REFERENCES dbo.courses (course_code),
  template_version  nvarchar(32)   NULL,
  config_json       nvarchar(max)  NOT NULL CONSTRAINT ck_project_configs_config_json CHECK (ISJSON(config_json) = 1),
  updated_at        datetime2(3)   NOT NULL CONSTRAINT df_project_configs_updated_at DEFAULT SYSUTCDATETIME(),
  row_version       rowversion     NOT NULL,
  CONSTRAINT pk_project_configs PRIMARY KEY (class_id, project_code)
);
GO

CREATE TABLE dbo.project_progress (
  class_id         nvarchar(64)   NOT NULL,
  project_code     nvarchar(16)   NOT NULL,
  student_user_id  nvarchar(64)   NOT NULL CONSTRAINT fk_project_progress_student REFERENCES dbo.users (user_id),
  progress_json    nvarchar(max)  NOT NULL CONSTRAINT ck_project_progress_progress_json CHECK (ISJSON(progress_json) = 1),
  updated_at       datetime2(3)   NOT NULL CONSTRAINT df_project_progress_updated_at DEFAULT SYSUTCDATETIME(),
  row_version      rowversion     NOT NULL,
  CONSTRAINT pk_project_progress PRIMARY KEY (class_id, project_code, student_user_id),
  CONSTRAINT fk_project_progress_config FOREIGN KEY (class_id, project_code)
    REFERENCES dbo.project_configs (class_id, project_code)
);
GO

-- One document per student and kind; these are always read and written whole by one student.
CREATE TABLE dbo.student_activity (
  student_user_id  nvarchar(64)   NOT NULL CONSTRAINT fk_student_activity_student REFERENCES dbo.users (user_id),
  activity_kind    varchar(32)    NOT NULL CONSTRAINT ck_student_activity_kind CHECK (activity_kind IN (
                                    'game_results', 'number_conversion', 'learning_practice', 'learning_study', 'recognition')),
  data_json        nvarchar(max)  NOT NULL CONSTRAINT ck_student_activity_data_json CHECK (ISJSON(data_json) = 1),
  updated_at       datetime2(3)   NOT NULL CONSTRAINT df_student_activity_updated_at DEFAULT SYSUTCDATETIME(),
  row_version      rowversion     NOT NULL,
  CONSTRAINT pk_student_activity PRIMARY KEY (student_user_id, activity_kind)
);
GO

CREATE TABLE dbo.live_challenges (
  challenge_id   nvarchar(128)  NOT NULL CONSTRAINT pk_live_challenges PRIMARY KEY,
  school_id      nvarchar(64)   NOT NULL CONSTRAINT fk_live_challenges_school REFERENCES dbo.schools (school_id),
  owner_user_id  nvarchar(64)   NOT NULL CONSTRAINT fk_live_challenges_owner REFERENCES dbo.users (user_id),
  course_code    nvarchar(16)   NULL CONSTRAINT fk_live_challenges_course REFERENCES dbo.courses (course_code),
  title          nvarchar(300)  NOT NULL,
  content_json   nvarchar(max)  NOT NULL CONSTRAINT ck_live_challenges_content_json CHECK (ISJSON(content_json) = 1),
  created_at     datetime2(3)   NOT NULL CONSTRAINT df_live_challenges_created_at DEFAULT SYSUTCDATETIME(),
  updated_at     datetime2(3)   NOT NULL CONSTRAINT df_live_challenges_updated_at DEFAULT SYSUTCDATETIME(),
  row_version    rowversion     NOT NULL
);
GO
CREATE INDEX ix_live_challenges_owner ON dbo.live_challenges (owner_user_id, updated_at);
GO

CREATE TABLE dbo.live_sessions (
  join_code      nvarchar(32)   NOT NULL CONSTRAINT pk_live_sessions PRIMARY KEY,
  session_id     nvarchar(64)   NOT NULL,
  school_id      nvarchar(64)   NOT NULL CONSTRAINT fk_live_sessions_school REFERENCES dbo.schools (school_id),
  owner_user_id  nvarchar(64)   NOT NULL CONSTRAINT fk_live_sessions_owner REFERENCES dbo.users (user_id),
  challenge_id   nvarchar(128)  NULL,
  class_id       nvarchar(64)   NULL CONSTRAINT fk_live_sessions_class REFERENCES dbo.classes (class_id),
  status         varchar(24)    NOT NULL,
  state_json     nvarchar(max)  NOT NULL CONSTRAINT ck_live_sessions_state_json CHECK (ISJSON(state_json) = 1),
  created_at     datetime2(3)   NOT NULL CONSTRAINT df_live_sessions_created_at DEFAULT SYSUTCDATETIME(),
  updated_at     datetime2(3)   NOT NULL CONSTRAINT df_live_sessions_updated_at DEFAULT SYSUTCDATETIME(),
  row_version    rowversion     NOT NULL
);
GO
CREATE UNIQUE INDEX ux_live_sessions_session ON dbo.live_sessions (session_id);
GO

CREATE TABLE dbo.audit_log (
  audit_id         bigint IDENTITY(1, 1) NOT NULL CONSTRAINT pk_audit_log PRIMARY KEY,
  school_id        nvarchar(64)   NULL CONSTRAINT fk_audit_log_school REFERENCES dbo.schools (school_id),
  actor_user_id    nvarchar(64)   NULL,
  actor_label      nvarchar(128)  NULL,
  action           varchar(64)    NOT NULL,
  target_type      varchar(32)    NULL,
  target_id        nvarchar(200)  NULL,
  target_label     nvarchar(300)  NULL,
  details_json     nvarchar(max)  NULL CONSTRAINT ck_audit_log_details_json CHECK (details_json IS NULL OR ISJSON(details_json) = 1),
  legacy_blob_name nvarchar(200)  NULL,
  created_at       datetime2(3)   NOT NULL CONSTRAINT df_audit_log_created_at DEFAULT SYSUTCDATETIME()
);
GO
CREATE INDEX ix_audit_log_school_created ON dbo.audit_log (school_id, created_at);
GO

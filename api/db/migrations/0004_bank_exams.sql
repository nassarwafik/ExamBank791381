-- Phase 15A — question bank (official / school / private) and saved exams and templates.
-- Tables are created now and filled in Phase 15E.

-- A source groups questions (an official exam year, an import, or a teacher's own questions).
-- Visibility is decided on the source:
--   official  platform-wide, curated by the platform admin, readable by every teacher
--   school    shared inside one school
--   private   owned by one teacher (inside one school)
CREATE TABLE dbo.question_sources (
  source_id        nvarchar(128)   NOT NULL CONSTRAINT pk_question_sources PRIMARY KEY,
  course_code      nvarchar(16)   NOT NULL CONSTRAINT fk_question_sources_course REFERENCES dbo.courses (course_code),
  visibility       varchar(16)    NOT NULL CONSTRAINT ck_question_sources_visibility CHECK (visibility IN ('official', 'school', 'private')),
  school_id        nvarchar(64)   NULL CONSTRAINT fk_question_sources_school REFERENCES dbo.schools (school_id),
  owner_user_id    nvarchar(64)   NULL CONSTRAINT fk_question_sources_owner REFERENCES dbo.users (user_id),
  title            nvarchar(300)  NOT NULL CONSTRAINT df_question_sources_title DEFAULT N'',
  exam_year        int            NULL,
  exam_code        nvarchar(32)   NULL,
  source_priority  int            NULL,
  meta_json        nvarchar(max)  NULL CONSTRAINT ck_question_sources_meta_json CHECK (meta_json IS NULL OR ISJSON(meta_json) = 1),
  created_at       datetime2(3)   NOT NULL CONSTRAINT df_question_sources_created_at DEFAULT SYSUTCDATETIME(),
  updated_at       datetime2(3)   NOT NULL CONSTRAINT df_question_sources_updated_at DEFAULT SYSUTCDATETIME(),
  row_version      rowversion     NOT NULL,
  CONSTRAINT ck_question_sources_scope CHECK (
    (visibility = 'official' AND school_id IS NULL AND owner_user_id IS NULL) OR
    (visibility = 'school'   AND school_id IS NOT NULL) OR
    (visibility = 'private'  AND school_id IS NOT NULL AND owner_user_id IS NOT NULL)
  )
);
GO
CREATE INDEX ix_question_sources_scope ON dbo.question_sources (course_code, visibility, school_id, owner_user_id);
GO

-- Metadata columns are the legacy questions-index entry (what selection and filtering use);
-- content_json is the full question exactly as stored in sources/<id>.json today.
CREATE TABLE dbo.questions (
  question_id         nvarchar(128)   NOT NULL CONSTRAINT pk_questions PRIMARY KEY,
  source_id           nvarchar(128)   NOT NULL CONSTRAINT fk_questions_source REFERENCES dbo.question_sources (source_id),
  course_code         nvarchar(16)   NOT NULL CONSTRAINT fk_questions_course REFERENCES dbo.courses (course_code),
  question_number     nvarchar(16)   NULL,
  section             nvarchar(32)   NULL,
  question_type       varchar(32)    NULL,
  original_type       varchar(32)    NULL,
  topic               nvarchar(100)  NULL,
  difficulty          varchar(16)    NULL,
  family_key          nvarchar(128)  NULL,
  review_status       varchar(24)    NULL,
  has_image           bit            NOT NULL CONSTRAINT df_questions_has_image DEFAULT 0,
  content_json        nvarchar(max)  NOT NULL CONSTRAINT ck_questions_content_json CHECK (ISJSON(content_json) = 1),
  created_by_user_id  nvarchar(64)   NULL CONSTRAINT fk_questions_created_by REFERENCES dbo.users (user_id),
  created_at          datetime2(3)   NOT NULL CONSTRAINT df_questions_created_at DEFAULT SYSUTCDATETIME(),
  updated_at          datetime2(3)   NOT NULL CONSTRAINT df_questions_updated_at DEFAULT SYSUTCDATETIME(),
  row_version         rowversion     NOT NULL
);
GO
CREATE INDEX ix_questions_selection ON dbo.questions (course_code, section, topic, difficulty) INCLUDE (source_id, question_type, review_status);
GO
CREATE INDEX ix_questions_source ON dbo.questions (source_id);
GO
CREATE INDEX ix_questions_family ON dbo.questions (family_key) WHERE family_key IS NOT NULL;
GO

-- Images stay in Blob Storage (container assets); a row points at the blob.
CREATE TABLE dbo.question_assets (
  question_id   nvarchar(128)   NOT NULL CONSTRAINT fk_question_assets_question REFERENCES dbo.questions (question_id),
  asset_id      nvarchar(128)  NOT NULL,
  container     varchar(32)    NOT NULL,
  blob_name     nvarchar(400)  NOT NULL,
  content_type  varchar(100)   NULL,
  CONSTRAINT pk_question_assets PRIMARY KEY (question_id, asset_id)
);
GO

-- Saved exams (exams/<id>.json) and exam templates (templates/<date>/<…>.json).
CREATE TABLE dbo.exams (
  exam_id        nvarchar(128)   NOT NULL CONSTRAINT pk_exams PRIMARY KEY,
  school_id      nvarchar(64)   NOT NULL CONSTRAINT fk_exams_school REFERENCES dbo.schools (school_id),
  owner_user_id  nvarchar(64)   NOT NULL CONSTRAINT fk_exams_owner REFERENCES dbo.users (user_id),
  course_code    nvarchar(16)   NULL CONSTRAINT fk_exams_course REFERENCES dbo.courses (course_code),
  kind           varchar(16)    NOT NULL CONSTRAINT ck_exams_kind CHECK (kind IN ('saved', 'template')),
  visibility     varchar(16)    NOT NULL CONSTRAINT df_exams_visibility DEFAULT 'private'
                                CONSTRAINT ck_exams_visibility CHECK (visibility IN ('private', 'school')),
  title          nvarchar(300)  NOT NULL,
  content_json   nvarchar(max)  NOT NULL CONSTRAINT ck_exams_content_json CHECK (ISJSON(content_json) = 1),
  legacy_blob_name nvarchar(400) NULL,
  created_at     datetime2(3)   NOT NULL CONSTRAINT df_exams_created_at DEFAULT SYSUTCDATETIME(),
  updated_at     datetime2(3)   NOT NULL CONSTRAINT df_exams_updated_at DEFAULT SYSUTCDATETIME(),
  row_version    rowversion     NOT NULL
);
GO
CREATE INDEX ix_exams_owner ON dbo.exams (owner_user_id, kind, updated_at);
GO
CREATE INDEX ix_exams_school ON dbo.exams (school_id, visibility, kind);
GO

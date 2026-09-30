-- Phase 15A — tenancy and identity.
-- See docs/database-architecture-15.md §3 and §5. Ids keep the legacy values verbatim (nvarchar(64)).

CREATE TABLE dbo.schools (
  school_id      nvarchar(64)   NOT NULL CONSTRAINT pk_schools PRIMARY KEY,
  name           nvarchar(200)  NOT NULL,
  ministry_code  nvarchar(32)   NULL,
  status         varchar(16)    NOT NULL CONSTRAINT df_schools_status DEFAULT 'active'
                                CONSTRAINT ck_schools_status CHECK (status IN ('active', 'suspended', 'archived')),
  settings_json  nvarchar(max)  NULL CONSTRAINT ck_schools_settings_json CHECK (settings_json IS NULL OR ISJSON(settings_json) = 1),
  created_at     datetime2(3)   NOT NULL CONSTRAINT df_schools_created_at DEFAULT SYSUTCDATETIME(),
  updated_at     datetime2(3)   NOT NULL CONSTRAINT df_schools_updated_at DEFAULT SYSUTCDATETIME(),
  row_version    rowversion     NOT NULL
);
GO
CREATE UNIQUE INDEX ux_schools_ministry_code ON dbo.schools (ministry_code) WHERE ministry_code IS NOT NULL;
GO

-- One row per person. kind = staff (platform admin, school admin, teacher) or student.
-- is_active / is_archived mirror the legacy student flags exactly (active, archived).
CREATE TABLE dbo.users (
  user_id             nvarchar(64)   NOT NULL CONSTRAINT pk_users PRIMARY KEY,
  kind                varchar(16)    NOT NULL CONSTRAINT ck_users_kind CHECK (kind IN ('staff', 'student')),
  login_code          nvarchar(64)   NOT NULL,
  identity_number     varchar(16)    NULL,
  first_name          nvarchar(100)  NOT NULL CONSTRAINT df_users_first_name DEFAULT N'',
  family_name         nvarchar(100)  NOT NULL CONSTRAINT df_users_family_name DEFAULT N'',
  display_name        nvarchar(200)  NOT NULL,
  email               nvarchar(254)  NULL,
  is_platform_admin   bit            NOT NULL CONSTRAINT df_users_is_platform_admin DEFAULT 0,
  is_active           bit            NOT NULL CONSTRAINT df_users_is_active DEFAULT 1,
  is_archived         bit            NOT NULL CONSTRAINT df_users_is_archived DEFAULT 0,
  auth_version        int            NOT NULL CONSTRAINT df_users_auth_version DEFAULT 1,
  avatar_id           varchar(16)    NULL,
  photo_blob_key      nvarchar(400)  NULL,
  photo_version       int            NULL,
  photo_updated_at    datetime2(3)   NULL,
  share_achievements  bit            NULL,
  last_login_at       datetime2(3)   NULL,
  extra_json          nvarchar(max)  NULL CONSTRAINT ck_users_extra_json CHECK (extra_json IS NULL OR ISJSON(extra_json) = 1),
  created_at          datetime2(3)   NOT NULL CONSTRAINT df_users_created_at DEFAULT SYSUTCDATETIME(),
  updated_at          datetime2(3)   NOT NULL CONSTRAINT df_users_updated_at DEFAULT SYSUTCDATETIME(),
  row_version         rowversion     NOT NULL
);
GO
CREATE UNIQUE INDEX ux_users_login_code ON dbo.users (login_code);
GO
CREATE UNIQUE INDEX ux_users_identity_number ON dbo.users (identity_number) WHERE identity_number IS NOT NULL;
GO

-- Password material, separate from the profile so list queries never touch it.
-- hash_scheme 'scrypt-b64-v1' = the legacy student scheme (crypto.scryptSync, base64 salt and hash).
CREATE TABLE dbo.user_credentials (
  user_id               nvarchar(64)  NOT NULL CONSTRAINT pk_user_credentials PRIMARY KEY
                                      CONSTRAINT fk_user_credentials_user REFERENCES dbo.users (user_id),
  hash_scheme           varchar(32)   NOT NULL,
  password_salt         varchar(128)  NOT NULL,
  password_hash         varchar(256)  NOT NULL,
  auth_version          int           NOT NULL,
  is_active             bit           NOT NULL CONSTRAINT df_user_credentials_is_active DEFAULT 1,
  must_change_password  bit           NOT NULL CONSTRAINT df_user_credentials_must_change DEFAULT 0,
  extra_json            nvarchar(max) NULL CONSTRAINT ck_user_credentials_extra_json CHECK (extra_json IS NULL OR ISJSON(extra_json) = 1),
  created_at            datetime2(3)  NOT NULL CONSTRAINT df_user_credentials_created_at DEFAULT SYSUTCDATETIME(),
  updated_at            datetime2(3)  NOT NULL CONSTRAINT df_user_credentials_updated_at DEFAULT SYSUTCDATETIME(),
  row_version           rowversion    NOT NULL
);
GO

-- A user's role inside a school. A teacher may belong to several schools; a person may be both
-- school_admin and teacher in the same school (two rows).
CREATE TABLE dbo.school_memberships (
  school_id   nvarchar(64)  NOT NULL CONSTRAINT fk_school_memberships_school REFERENCES dbo.schools (school_id),
  user_id     nvarchar(64)  NOT NULL CONSTRAINT fk_school_memberships_user REFERENCES dbo.users (user_id),
  role        varchar(16)   NOT NULL CONSTRAINT ck_school_memberships_role CHECK (role IN ('school_admin', 'teacher', 'student')),
  status      varchar(16)   NOT NULL CONSTRAINT df_school_memberships_status DEFAULT 'active'
                            CONSTRAINT ck_school_memberships_status CHECK (status IN ('active', 'left')),
  created_at  datetime2(3)  NOT NULL CONSTRAINT df_school_memberships_created_at DEFAULT SYSUTCDATETIME(),
  updated_at  datetime2(3)  NOT NULL CONSTRAINT df_school_memberships_updated_at DEFAULT SYSUTCDATETIME(),
  row_version rowversion    NOT NULL,
  CONSTRAINT pk_school_memberships PRIMARY KEY (school_id, user_id, role)
);
GO
CREATE INDEX ix_school_memberships_user ON dbo.school_memberships (user_id, status);
GO

-- Replaces platform/throttle/login-*.json (per identifier + client, and per identifier globally).
CREATE TABLE dbo.login_throttle (
  throttle_key       char(64)      NOT NULL CONSTRAINT pk_login_throttle PRIMARY KEY,
  failures           int           NOT NULL CONSTRAINT df_login_throttle_failures DEFAULT 0,
  window_started_at  datetime2(3)  NOT NULL,
  blocked_until      datetime2(3)  NULL,
  updated_at         datetime2(3)  NOT NULL CONSTRAINT df_login_throttle_updated_at DEFAULT SYSUTCDATETIME(),
  row_version        rowversion    NOT NULL
);
GO

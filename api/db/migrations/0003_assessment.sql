-- Phase 15A — assignments, submissions and attempts.
-- A submission is one (assignment, student) pair; its attempts[] array becomes rows of dbo.attempts.
-- Payloads that are always read and written whole stay JSON (exam snapshot, answers, grades).

CREATE TABLE dbo.assignments (
  assignment_id           nvarchar(64)   NOT NULL CONSTRAINT pk_assignments PRIMARY KEY,
  school_id               nvarchar(64)   NOT NULL CONSTRAINT fk_assignments_school REFERENCES dbo.schools (school_id),
  class_id                nvarchar(64)   NOT NULL CONSTRAINT fk_assignments_class REFERENCES dbo.classes (class_id),
  title                   nvarchar(300)  NOT NULL,
  instructions            nvarchar(max)  NOT NULL CONSTRAINT df_assignments_instructions DEFAULT N'',
  status                  varchar(16)    NOT NULL CONSTRAINT ck_assignments_status CHECK (status IN ('draft', 'published', 'archived')),
  schema_version          int            NOT NULL CONSTRAINT df_assignments_schema_version DEFAULT 2,
  attempt_model_version   int            NOT NULL CONSTRAINT df_assignments_attempt_model DEFAULT 0,
  attempt_policy          varchar(24)    NULL,
  open_at                 datetime2(3)   NULL,
  due_at                  datetime2(3)   NULL,
  max_attempts            int            NOT NULL CONSTRAINT df_assignments_max_attempts DEFAULT 1,
  duration_minutes        int            NULL,
  source_exam_id          nvarchar(64)   NULL,
  source_exam_title       nvarchar(300)  NULL,
  class_name_at_creation  nvarchar(200)  NULL,
  question_count          int            NULL,
  total_marks             float          NULL,
  exam_snapshot_json      nvarchar(max)  NOT NULL CONSTRAINT ck_assignments_exam_snapshot_json CHECK (ISJSON(exam_snapshot_json) = 1),
  created_by              nvarchar(128)  NULL,
  created_by_user_id      nvarchar(64)   NULL CONSTRAINT fk_assignments_created_by REFERENCES dbo.users (user_id),
  extra_json              nvarchar(max)  NULL CONSTRAINT ck_assignments_extra_json CHECK (extra_json IS NULL OR ISJSON(extra_json) = 1),
  created_at              datetime2(3)   NOT NULL CONSTRAINT df_assignments_created_at DEFAULT SYSUTCDATETIME(),
  updated_at              datetime2(3)   NOT NULL CONSTRAINT df_assignments_updated_at DEFAULT SYSUTCDATETIME(),
  row_version             rowversion     NOT NULL
);
GO
CREATE INDEX ix_assignments_class_status ON dbo.assignments (class_id, status) INCLUDE (open_at, due_at, title);
GO
CREATE INDEX ix_assignments_school_created ON dbo.assignments (school_id, created_at);
GO

CREATE TABLE dbo.submissions (
  assignment_id           nvarchar(64)   NOT NULL CONSTRAINT fk_submissions_assignment REFERENCES dbo.assignments (assignment_id),
  student_user_id         nvarchar(64)   NOT NULL CONSTRAINT fk_submissions_student REFERENCES dbo.users (user_id),
  class_id                nvarchar(64)   NULL,
  student_code_at_start   nvarchar(64)   NULL,
  student_name_at_start   nvarchar(200)  NULL,
  allowed_attempts        int            NULL,
  draft_answers_json      nvarchar(max)  NOT NULL CONSTRAINT ck_submissions_draft_answers_json CHECK (ISJSON(draft_answers_json) = 1),
  active_attempt_json     nvarchar(max)  NULL CONSTRAINT ck_submissions_active_attempt_json CHECK (active_attempt_json IS NULL OR ISJSON(active_attempt_json) = 1),
  extra_json              nvarchar(max)  NULL CONSTRAINT ck_submissions_extra_json CHECK (extra_json IS NULL OR ISJSON(extra_json) = 1),
  created_at              datetime2(3)   NOT NULL CONSTRAINT df_submissions_created_at DEFAULT SYSUTCDATETIME(),
  updated_at              datetime2(3)   NOT NULL CONSTRAINT df_submissions_updated_at DEFAULT SYSUTCDATETIME(),
  row_version             rowversion     NOT NULL,
  CONSTRAINT pk_submissions PRIMARY KEY (assignment_id, student_user_id)
);
GO
CREATE INDEX ix_submissions_student ON dbo.submissions (student_user_id);
GO

CREATE TABLE dbo.attempts (
  assignment_id          nvarchar(64)   NOT NULL,
  student_user_id        nvarchar(64)   NOT NULL,
  attempt_number         int            NOT NULL,
  started_at             datetime2(3)   NULL,
  ends_at                datetime2(3)   NULL,
  submitted_at           datetime2(3)   NULL,
  ended_at               datetime2(3)   NULL,
  end_reason             varchar(24)    NULL,
  timed_out              bit            NOT NULL CONSTRAINT df_attempts_timed_out DEFAULT 0,
  score                  float          NULL,
  total_marks            float          NULL,
  percentage             float          NULL,
  manual_review_marks    float          NULL,
  finalized              bit            NULL,
  reviewed_at            datetime2(3)   NULL,
  teacher_feedback       nvarchar(max)  NOT NULL CONSTRAINT df_attempts_teacher_feedback DEFAULT N'',
  answers_json           nvarchar(max)  NOT NULL CONSTRAINT ck_attempts_answers_json CHECK (ISJSON(answers_json) = 1),
  question_grades_json   nvarchar(max)  NULL CONSTRAINT ck_attempts_question_grades_json CHECK (question_grades_json IS NULL OR ISJSON(question_grades_json) = 1),
  sections_json          nvarchar(max)  NULL CONSTRAINT ck_attempts_sections_json CHECK (sections_json IS NULL OR ISJSON(sections_json) = 1),
  manual_overrides_json  nvarchar(max)  NULL CONSTRAINT ck_attempts_manual_overrides_json CHECK (manual_overrides_json IS NULL OR ISJSON(manual_overrides_json) = 1),
  extra_json             nvarchar(max)  NULL CONSTRAINT ck_attempts_extra_json CHECK (extra_json IS NULL OR ISJSON(extra_json) = 1),
  row_version            rowversion     NOT NULL,
  CONSTRAINT pk_attempts PRIMARY KEY (assignment_id, student_user_id, attempt_number),
  CONSTRAINT fk_attempts_submission FOREIGN KEY (assignment_id, student_user_id)
    REFERENCES dbo.submissions (assignment_id, student_user_id)
);
GO

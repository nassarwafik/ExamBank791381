-- Phase 15A — courses, classes, teachers of a class, and enrollments.
-- enrollments replaces both user.classId (legacy authority) and classroom.studentIds (legacy roster index).

CREATE TABLE dbo.courses (
  course_code  nvarchar(16)   NOT NULL CONSTRAINT pk_courses PRIMARY KEY,
  title        nvarchar(200)  NOT NULL,
  kind         varchar(16)    NOT NULL CONSTRAINT ck_courses_kind CHECK (kind IN ('course', 'project')),
  is_active    bit            NOT NULL CONSTRAINT df_courses_is_active DEFAULT 1,
  created_at   datetime2(3)   NOT NULL CONSTRAINT df_courses_created_at DEFAULT SYSUTCDATETIME()
);
GO
INSERT INTO dbo.courses (course_code, title, kind) VALUES
  (N'791381', N'شبكات الاتصال', 'course'),
  (N'794589', N'مشروع 794589', 'project'),
  (N'883589', N'مشروع 883589', 'project'),
  (N'899373', N'مشروع 899373', 'project');
GO

CREATE TABLE dbo.classes (
  class_id         nvarchar(64)   NOT NULL CONSTRAINT pk_classes PRIMARY KEY,
  school_id        nvarchar(64)   NOT NULL CONSTRAINT fk_classes_school REFERENCES dbo.schools (school_id),
  name             nvarchar(200)  NOT NULL,
  grade            nvarchar(16)   NOT NULL CONSTRAINT df_classes_grade DEFAULT N'',
  school_year      nvarchar(16)   NOT NULL CONSTRAINT df_classes_school_year DEFAULT N'',
  status           varchar(16)    NOT NULL CONSTRAINT df_classes_status DEFAULT 'active'
                                  CONSTRAINT ck_classes_status CHECK (status IN ('active', 'archived')),
  archived_at      datetime2(3)   NULL,
  archived_by      nvarchar(128)  NULL,
  archive_reason   varchar(16)    NULL,
  graduation_year  nvarchar(16)   NULL,
  extra_json       nvarchar(max)  NULL CONSTRAINT ck_classes_extra_json CHECK (extra_json IS NULL OR ISJSON(extra_json) = 1),
  created_at       datetime2(3)   NOT NULL CONSTRAINT df_classes_created_at DEFAULT SYSUTCDATETIME(),
  updated_at       datetime2(3)   NOT NULL CONSTRAINT df_classes_updated_at DEFAULT SYSUTCDATETIME(),
  row_version      rowversion     NOT NULL
);
GO
CREATE INDEX ix_classes_school_status ON dbo.classes (school_id, status);
GO

-- Who teaches a class. Exactly one owner per class; any number of co-teachers.
CREATE TABLE dbo.class_teachers (
  class_id         nvarchar(64)  NOT NULL CONSTRAINT fk_class_teachers_class REFERENCES dbo.classes (class_id),
  teacher_user_id  nvarchar(64)  NOT NULL CONSTRAINT fk_class_teachers_user REFERENCES dbo.users (user_id),
  role             varchar(16)   NOT NULL CONSTRAINT ck_class_teachers_role CHECK (role IN ('owner', 'co_teacher')),
  added_at         datetime2(3)  NOT NULL CONSTRAINT df_class_teachers_added_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT pk_class_teachers PRIMARY KEY (class_id, teacher_user_id)
);
GO
CREATE UNIQUE INDEX ux_class_teachers_owner ON dbo.class_teachers (class_id) WHERE role = 'owner';
GO
CREATE INDEX ix_class_teachers_teacher ON dbo.class_teachers (teacher_user_id);
GO

-- Legacy classroom.programCodes[] (and the older scalar programCode): the projects a class follows.
CREATE TABLE dbo.class_programs (
  class_id     nvarchar(64)  NOT NULL CONSTRAINT fk_class_programs_class REFERENCES dbo.classes (class_id),
  course_code  nvarchar(16)  NOT NULL CONSTRAINT fk_class_programs_course REFERENCES dbo.courses (course_code),
  CONSTRAINT pk_class_programs PRIMARY KEY (class_id, course_code)
);
GO

-- Legacy classroom.learningMaterials[]: { courseId, visibleModuleIds[] } per class.
CREATE TABLE dbo.class_learning_courses (
  class_id                 nvarchar(64)   NOT NULL CONSTRAINT fk_class_learning_courses_class REFERENCES dbo.classes (class_id),
  course_id                nvarchar(32)   NOT NULL,
  visible_module_ids_json  nvarchar(max)  NOT NULL CONSTRAINT ck_class_learning_courses_modules_json CHECK (ISJSON(visible_module_ids_json) = 1),
  updated_at               datetime2(3)   NOT NULL CONSTRAINT df_class_learning_courses_updated_at DEFAULT SYSUTCDATETIME(),
  row_version              rowversion     NOT NULL,
  CONSTRAINT pk_class_learning_courses PRIMARY KEY (class_id, course_id)
);
GO

-- A student in a class. A student may have several active enrollments (several teachers / subjects).
CREATE TABLE dbo.enrollments (
  class_id         nvarchar(64)  NOT NULL CONSTRAINT fk_enrollments_class REFERENCES dbo.classes (class_id),
  student_user_id  nvarchar(64)  NOT NULL CONSTRAINT fk_enrollments_user REFERENCES dbo.users (user_id),
  status           varchar(16)   NOT NULL CONSTRAINT df_enrollments_status DEFAULT 'active'
                                 CONSTRAINT ck_enrollments_status CHECK (status IN ('active', 'removed')),
  enrolled_at      datetime2(3)  NOT NULL CONSTRAINT df_enrollments_enrolled_at DEFAULT SYSUTCDATETIME(),
  ended_at         datetime2(3)  NULL,
  row_version      rowversion    NOT NULL,
  CONSTRAINT pk_enrollments PRIMARY KEY (class_id, student_user_id)
);
GO
CREATE INDEX ix_enrollments_student ON dbo.enrollments (student_user_id, status);
GO

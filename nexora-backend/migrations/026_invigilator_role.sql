-- Limited staff role: assistance endpoints only; no teacher/admin privileges.
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('student','teacher','school_admin','invigilator'));

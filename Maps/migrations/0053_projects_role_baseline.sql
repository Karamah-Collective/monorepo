-- Projects is a shared Karamah workspace. These grants expose the project
-- surface to every standard Admin role; project membership and task visibility
-- remain the authoritative read/write boundary inside the Projects database.
-- Rebuild each role's array from a set union so this forward migration is
-- safe to rerun in local setup and does not accumulate duplicate grants.
WITH baseline(value) AS (VALUES
  ('operations.projects.read'),
  ('operations.projects.write'),
  ('operations.tasks.read'),
  ('operations.tasks.write'),
  ('operations.tasks.create'),
  ('operations.tasks.comment'),
  ('operations.tasks.relate'),
  ('operations.tasks.attach'),
  ('operations.milestones.read'),
  ('operations.milestones.write')
)
UPDATE admin_roles
SET permissions = (
  SELECT json_group_array(value)
  FROM (
    SELECT value FROM json_each(admin_roles.permissions)
    UNION
    SELECT value FROM baseline
  )
)
WHERE id IN ('viewer','map-editor','content-editor','moderator');

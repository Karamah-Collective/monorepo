-- Add the Operations workspace capabilities to the built-in role presets.
-- Custom roles remain unchanged and can opt in through Admin > Roles & access.
UPDATE admin_roles SET permissions=json_insert(CASE WHEN json_valid(permissions) THEN permissions ELSE '[]' END, '$[#]', 'operations.tasks.read')
WHERE id IN ('map-editor','content-editor','moderator','viewer') AND is_preset=1
  AND NOT EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(permissions) THEN permissions ELSE '[]' END) WHERE value='operations.tasks.read');
UPDATE admin_roles SET permissions=json_insert(CASE WHEN json_valid(permissions) THEN permissions ELSE '[]' END, '$[#]', 'operations.tasks.write')
WHERE id IN ('map-editor','content-editor','moderator') AND is_preset=1
  AND NOT EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(permissions) THEN permissions ELSE '[]' END) WHERE value='operations.tasks.write');
UPDATE admin_roles SET permissions=json_insert(CASE WHEN json_valid(permissions) THEN permissions ELSE '[]' END, '$[#]', 'operations.tasks.assign')
WHERE id IN ('map-editor','content-editor','moderator') AND is_preset=1
  AND NOT EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(permissions) THEN permissions ELSE '[]' END) WHERE value='operations.tasks.assign');

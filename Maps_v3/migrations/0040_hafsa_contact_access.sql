-- Hafsa can work the shared contact mailbox. Her personal mailbox is
-- connected separately through personal Gmail OAuth and remains UID-scoped.
INSERT INTO admin_roles (id, name, description, permissions, is_preset)
VALUES (
  'contact-agent',
  'Contact mailbox agent',
  'Manage the shared contact mailbox without access to the Manarah mailbox.',
  '["inbox.contact.read","inbox.contact.write"]',
  0
)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name,
  description=excluded.description,
  permissions=excluded.permissions,
  updated_at=datetime('now');

INSERT INTO admin_role_members (email, role_id, display_name, added_by)
VALUES ('hafsa@karamahcollective.com', 'contact-agent', 'Hafsa', 'initial contact mailbox setup')
ON CONFLICT(email) DO UPDATE SET
  role_id=excluded.role_id,
  display_name=COALESCE(NULLIF(admin_role_members.display_name,''), excluded.display_name),
  updated_at=datetime('now');

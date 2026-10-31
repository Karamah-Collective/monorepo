-- Hafsa can work both shared mailboxes, but connection management remains owner-only.
UPDATE admin_roles
SET
  description='Manage both shared mailboxes without access to personal Gmail.',
  permissions='["inbox.contact.read","inbox.contact.write","inbox.manarah.read","inbox.manarah.write"]',
  updated_at=datetime('now')
WHERE id='contact-agent';

-- Replace the retired Maps mailbox with the Google Workspace Manarah mailbox.
UPDATE inbox_threads
SET mailbox = 'manarah@karamahcollective.com'
WHERE lower(mailbox) = 'maps@karamahcollective.com';

UPDATE inbox_messages
SET recipient_email = 'manarah@karamahcollective.com'
WHERE lower(recipient_email) = 'maps@karamahcollective.com';

-- Preserve the existing moderator preset while granting it both inboxes.
UPDATE admin_roles
SET permissions = '["moderation.*","inbox.*"]', updated_at = datetime('now')
WHERE id = 'moderator';

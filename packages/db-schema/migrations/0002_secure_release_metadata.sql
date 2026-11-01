ALTER TABLE app_releases ADD COLUMN file_name TEXT;
ALTER TABLE app_releases ADD COLUMN file_size INTEGER NOT NULL DEFAULT 0;

-- Legacy bot versions stored passwords in linked_accounts.mk.
-- Keep account identifiers but remove credential-like fields from every record.
UPDATE users
SET linked_accounts = (
  SELECT COALESCE(
    json_group_object(
      brand.key,
      json(
        CASE
          WHEN json_type(brand.value) = 'array' THEN (
            SELECT json_group_array(
              json_object(
                'tk', json_extract(account.value, '$.tk'),
                'miniCode', COALESCE(json_extract(account.value, '$.miniCode'), json_extract(account.value, '$.tk'))
              )
            )
            FROM json_each(brand.value) AS account
          )
          ELSE '[]'
        END
      )
    ),
    '{}'
  )
  FROM json_each(users.linked_accounts) AS brand
)
WHERE json_valid(linked_accounts) = 1
  AND json_type(linked_accounts) = 'object';

UPDATE users
SET linked_accounts = '{}'
WHERE linked_accounts IS NULL
   OR json_valid(linked_accounts) = 0
   OR json_type(linked_accounts) <> 'object';

CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
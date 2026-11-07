/*
# Enable citext extension for case-insensitive staff usernames
Adds the citext extension so staff usernames can be compared case-insensitively
(needed by the staff auth migration). No data changes.
*/
CREATE EXTENSION IF NOT EXISTS citext;
